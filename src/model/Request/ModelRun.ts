import type { ModelRequestFormat } from './ModelRequestFormat.js';
import type { ModelResponseFormat } from '../Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '../Response/ModelResponseSchema.js';

export interface ModelRunRequest {
  message: string;
  data?: unknown;
  format: ModelRequestFormat;
  guidance?: string;
}

export interface ModelRunResponse<TOutput extends object> {
  format: ModelResponseFormat;
  schema: ModelResponseSchema<TOutput>;
}

export interface ModelRunSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelRunInput<TOutput extends object> {
  request: ModelRunRequest;
  response: ModelRunResponse<TOutput>;
  settings?: ModelRunSettings;
}
