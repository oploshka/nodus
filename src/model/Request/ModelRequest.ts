import type { ModelGenerationConstraint } from '@model/Type/ModelGenerationConstraint.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  constraint?: ModelGenerationConstraint;
}
