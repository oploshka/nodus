import type { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import type { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

export interface ModelRunRequest {
  /** What the model is asked to do. */
  message: string;
  /** Application data the model should work with. */
  data?: unknown;
  /** How request.data is represented to the model. */
  format: ModelRequestFormat;
  /** Optional recommendations/constraints for how to perform the work. */
  guidance?: string;
}

export interface ModelRunResponse {
  /** Wire representation expected from the model. */
  format: ModelResponseFormat;
  /** One common object schema, independent from the wire format. */
  schema: ModelResponseSchema;
}

export interface ModelRunSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelRunInput<TOutput extends object = Record<string, unknown>> {
  request: ModelRunRequest;
  response: ModelRunResponse;
  settings?: ModelRunSettings;
  /** Compile-time output hint only; runtime shape is governed by response.schema. */
  readonly __outputType?: TOutput;
}
