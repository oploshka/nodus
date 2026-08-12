import type { ModelAdapter, RawModelResponse } from '../Adapter/ModelAdapter.js';
import type { ModelConfiguration } from '../Configuration/ModelConfiguration.js';
import type { ModelMessage, ModelRequest } from '../Request/ModelRequest.js';
import { transportMessages } from '../Request/ModelMessageTransport.js';
import type { ModelResponseFormatter } from '../Response/ModelResponseFormatter.js';

export interface ModelRunInput<TOutput extends object> {
  messages: ModelMessage[];
  formatter: ModelResponseFormatter<TOutput>;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelRunResult<TOutput extends object> {
  output: TOutput;
  usage?: RawModelResponse['usage'];
}

/**
 * Single gateway for model calls inside Nodus.
 * Adapters transport raw text; ModelRunner converts every successful response
 * into a typed JavaScript object before it leaves the model layer.
 */
export class ModelRunner {
  public constructor(
    private readonly adapter: ModelAdapter,
    private readonly configuration: ModelConfiguration,
  ) {}

  public async run<TOutput extends object>(input: ModelRunInput<TOutput>): Promise<ModelRunResult<TOutput>> {
    const request: ModelRequest = {
      model: this.configuration.model,
      messages: transportMessages(input.messages, this.configuration.messageLayout),
      temperature: input.temperature ?? this.configuration.temperature ?? 0,
      maxTokens: input.maxTokens === undefined
        ? this.configuration.maxTokens
        : Math.min(input.maxTokens, this.configuration.maxTokens ?? input.maxTokens),
    };
    const response = await this.adapter.complete(request);
    return {
      output: input.formatter.parse(response.content),
      usage: response.usage,
    };
  }
}
