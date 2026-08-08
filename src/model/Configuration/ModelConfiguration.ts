// ModelConfiguration.ts

export interface ModelConfiguration {
  provider: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}