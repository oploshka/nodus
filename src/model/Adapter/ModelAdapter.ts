// ModelAdapter.ts
import type { ModelRequest, ModelToolCall } from '@model/Request/ModelRequest';

export interface ModelUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface RawModelResponse {
  content: string;
  toolCalls?: ModelToolCall[];
  usage?: ModelUsage;
}

export interface ModelAdapter {
  complete(request: ModelRequest): Promise<RawModelResponse>;
}
