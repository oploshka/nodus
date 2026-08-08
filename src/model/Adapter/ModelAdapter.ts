// ModelAdapter.ts
import type { ModelRequest } from '@model/Request/ModelRequest';

export interface ModelUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface RawModelResponse {
  content: string;
  usage?: ModelUsage;
}

export interface ModelAdapter {
  complete(request: ModelRequest): Promise<RawModelResponse>;
}