import type { ModelRequest } from '../Request/ModelRequest.js';

export interface RawModelResponse {
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  finishReason?: string;
}

export interface ModelAdapter {
  complete(request: ModelRequest): Promise<RawModelResponse>;
}
