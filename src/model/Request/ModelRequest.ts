// ModelRequest.ts
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
}
