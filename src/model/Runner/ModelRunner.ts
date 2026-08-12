import type { ModelAdapter, RawModelResponse } from '../Adapter/ModelAdapter.js';
import type { ModelConfiguration } from '../Configuration/ModelConfiguration.js';
import type { ModelMessage, ModelRequest } from '../Request/ModelRequest.js';
import { transportMessages } from '../Request/ModelMessageTransport.js';
import { ModelRequestFormat, serializeRequestData } from '../Request/ModelRequestFormat.js';
import type { ModelRunInput, ModelRunRequest, ModelRunSettings } from '../Request/ModelRun.js';
import { ModelResponseFormat } from '../Response/ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from '../Response/format/ModelResponseFormatHandler.js';
import { TextResponseFormatHandler } from '../Response/format/TextResponseFormatHandler.js';
import { RawResponseFormatHandler } from '../Response/format/RawResponseFormatHandler.js';
import { JsonResponseFormatHandler } from '../Response/format/JsonResponseFormatHandler.js';
import { DiffResponseFormatHandler } from '../Response/format/DiffResponseFormatHandler.js';
import { UnifiedDiffResponseSchema, type UnifiedDiffModelResponse } from '../Response/schema/UnifiedDiffResponseSchema.js';

export interface ModelRunResult<TOutput extends object> {
  output: TOutput;
  usage?: RawModelResponse['usage'];
}

export interface DiffFileRunInput {
  path: string;
  request: Omit<ModelRunRequest, 'format'> & { format?: ModelRequestFormat };
  settings?: ModelRunSettings;
}

/**
 * Single model boundary for Nodus.
 *
 * Callers describe:
 * - what the model should do (`request.message`),
 * - what data it should work with and how to represent it,
 * - optional guidance,
 * - expected response wire format + semantic schema,
 * - per-call model settings.
 *
 * ModelRunner owns prompt assembly, adapter transport, response-format parsing,
 * schema decoding, and always returns a JavaScript object.
 */
export class ModelRunner {
  private readonly responseHandlers: Map<ModelResponseFormat, ModelResponseFormatHandler>;

  public constructor(
    private readonly adapter: ModelAdapter,
    private readonly configuration: ModelConfiguration,
  ) {
    const handlers: ModelResponseFormatHandler[] = [
      new TextResponseFormatHandler(),
      new RawResponseFormatHandler(),
      new JsonResponseFormatHandler(),
      new DiffResponseFormatHandler(),
    ];
    this.responseHandlers = new Map(handlers.map((handler) => [handler.format, handler]));
  }

  public async run<TOutput extends object>(input: ModelRunInput<TOutput>): Promise<ModelRunResult<TOutput>> {
    const handler = this.responseHandlers.get(input.response.format);
    if (!handler) throw new Error(`Unsupported model response format: ${input.response.format}`);

    const data = serializeRequestData(input.request.format, input.request.data);
    const messages: ModelMessage[] = [];
    const system = [
      input.request.guidance?.trim(),
      handler.instructions(),
      input.response.schema.instructions(),
    ].filter((value): value is string => Boolean(value && value.trim())).join('\n\n');
    if (system) messages.push({ role: 'system', content: system });

    const user = [
      input.request.message.trim(),
      data ? `DATA\n${data}` : '',
    ].filter(Boolean).join('\n\n');
    messages.push({ role: 'user', content: user });

    const request: ModelRequest = {
      model: input.settings?.model ?? this.configuration.model,
      messages: transportMessages(messages, this.configuration.messageLayout),
      temperature: input.settings?.temperature ?? this.configuration.temperature ?? 0,
      maxTokens: this.resolveMaxTokens(input.settings?.maxTokens),
    };

    const response = await this.adapter.complete(request);
    const wireValue = handler.parse(response.content);
    return {
      output: input.response.schema.decode(wireValue),
      usage: response.usage,
    };
  }

  /**
   * First specialized call helper. It is intentionally a thin facade over run().
   * If edit calls later need a different lifecycle, this method is the natural seam
   * to evolve without changing engine callers.
   */
  public diffFile(input: DiffFileRunInput): Promise<ModelRunResult<UnifiedDiffModelResponse>> {
    return this.run({
      request: {
        ...input.request,
        format: input.request.format ?? ModelRequestFormat.Text,
      },
      response: {
        format: ModelResponseFormat.Diff,
        schema: new UnifiedDiffResponseSchema(input.path),
      },
      settings: input.settings,
    });
  }

  private resolveMaxTokens(requested: number | undefined): number | undefined {
    if (requested === undefined) return this.configuration.maxTokens;
    if (this.configuration.maxTokens === undefined) return requested;
    return Math.min(requested, this.configuration.maxTokens);
  }
}
