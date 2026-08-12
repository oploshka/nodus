export interface ProjectConfiguration {
  id: string;
  root: string;
  scanMode?: 'manual' | 'on-open';
  include?: string[];
  exclude?: string[];
  indexCachePath?: string;
  researchCachePath?: string;
}

export interface ModelConfiguration {
  provider: 'openai-compatible';
  endpoint: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  requestTimeoutMs?: number;
}

export interface RuntimeConfiguration {
  maxWorkerIterations?: number;
  maxResearchActions?: number;
  maxEditActions?: number;
}

export interface AppConfiguration {
  project: ProjectConfiguration;
  model: ModelConfiguration;
  runtime?: RuntimeConfiguration;
}
