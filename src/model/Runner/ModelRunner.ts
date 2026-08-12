import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';
import type { ModelMessage, ModelRequest } from '@model/Request/ModelRequest.js';
import { transportMessages } from '@model/Request/ModelMessageTransport.js';
import { ModelRequestFormat, serializeRequestData } from '@model/Request/ModelRequestFormat.js';
import type { ModelRunInput, ModelRunRequest, ModelRunSettings } from '@model/Request/ModelRun.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import { responseSchemaInstructions, validateResponseSchema, type ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';
import { TextResponseFormatHandler } from '@model/Response/Format/TextResponseFormatHandler.js';
import { RawResponseFormatHandler } from '@model/Response/Format/RawResponseFormatHandler.js';
import { JsonResponseFormatHandler } from '@model/Response/Format/JsonResponseFormatHandler.js';
import { DiffResponseFormatHandler, type UnifiedDiffHunk } from '@model/Response/Format/DiffResponseFormatHandler.js';

export interface ModelExchangeMessage {
  role: 'system' | 'user' | 'assistant';
  message: string;
}

export interface ModelRunResult<TOutput extends object> {
  data: TOutput;
  exchange: {
    request: ModelExchangeMessage[];
    response: ModelExchangeMessage[];
  };
  meta: {
    model: string;
    temperature?: number;
    maxTokens?: number;
    durationMs: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    finishReason?: string;
  };
}

export interface UnifiedDiffModelResponse {
  path: string;
  hunks: UnifiedDiffHunk[];
}

export interface DiffFileRunInput {
  path: string;
  request: Omit<ModelRunRequest, 'format'> & { format?: ModelRequestFormat };
  settings?: ModelRunSettings;
}

/**
 * Single model boundary for Nodus.
 *
 * The caller supplies an application-level request, one common response schema,
 * a wire response format, and optional per-call settings. ModelRunner owns the
 * conversion to the actual adapter request and back to a validated JS object.
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

  public async run<TOutput extends object = Record<string, unknown>>(input: ModelRunInput<TOutput>): Promise<ModelRunResult<TOutput>> {
    const handler = this.responseHandlers.get(input.response.format);
    if (!handler) throw new Error(`Unsupported model response format: ${input.response.format}`);

    const data = serializeRequestData(input.request.format, input.request.data);
    const messages: ModelMessage[] = [];
    const system = [
      input.request.guidance?.trim(),
      handler.instructions(),
      responseSchemaInstructions(input.response.schema),
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

    const startedAt = performance.now();
    const response = await this.adapter.complete(request);
    const durationMs = performance.now() - startedAt;
    const wireValue = handler.parse(response.content);
    const parsed = validateResponseSchema<TOutput>(input.response.schema, wireValue);

    return {
      data: parsed,
      exchange: {
        request: request.messages.map((message) => ({ role: message.role, message: message.content })),
        response: [{ role: 'assistant', message: response.content }],
      },
      meta: {
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        durationMs,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
        finishReason: response.finishReason,
      },
    };
  }

  /**
   * Thin specialized call for the real diff use-case. It does not introduce a
   * second runner lifecycle: it only supplies Diff format + a common schema and
   * performs the target-path semantic check that belongs to this specialization.
   */
  public async diffFile(input: DiffFileRunInput): Promise<ModelRunResult<UnifiedDiffModelResponse>> {
    const schema: ModelResponseSchema = {
      description: `Unified diff for exactly ${input.path}`,
      fields: {
        path: { type: 'string', description: 'File path modified by the diff.' },
        hunks: { type: 'array', items: { type: 'any' }, description: 'Parsed unified diff hunks.' },
      },
    };

    const result = await this.run<UnifiedDiffModelResponse>({
      request: {
        ...input.request,
        format: input.request.format ?? ModelRequestFormat.Text,
      },
      response: { format: ModelResponseFormat.Diff, schema },
      settings: input.settings,
    });

    if (result.data.path !== input.path) {
      throw new Error(`Diff path mismatch: expected ${input.path}, received ${result.data.path}`);
    }
    return result;
  }

  private resolveMaxTokens(requested: number | undefined): number | undefined {
    if (requested === undefined) return this.configuration.maxTokens ?? 4096;
    if (this.configuration.maxTokens === undefined) return requested;
    return Math.min(requested, this.configuration.maxTokens);
  }
}
