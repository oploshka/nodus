import type { ModelMessageLayout } from '../Request/ModelMessageTransport.js';

export interface ModelConfiguration {
  provider: 'openai-compatible';
  endpoint: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  requestTimeoutMs?: number;
  messageLayout?: ModelMessageLayout;
}
