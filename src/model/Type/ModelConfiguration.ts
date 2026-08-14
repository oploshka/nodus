import type { ModelMessageLayout } from '@model/Request/ModelMessageTransport.js';

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
