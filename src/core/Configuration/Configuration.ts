// Configuration.ts
export type ScanMode = 'manual' | 'on-open' | 'disabled';
export type KnowledgeGenerationMode = 'disabled' | 'manual';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ModelProvider = 'mock' | 'openai-compatible';

export interface ProjectConfiguration {
  id: string;
  root: string;
  scanMode: ScanMode;
  cachePath?: string;
  knowledgePath?: string;
  include?: string[];
  exclude?: string[];
}

export interface ModelConfiguration {
  provider: ModelProvider;
  endpoint?: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentConfiguration {
  maxSteps: number;
}

export interface KnowledgeConfiguration {
  generationMode: KnowledgeGenerationMode;
}

export interface LoggingConfiguration {
  level: LogLevel;
  console: boolean;
  file: boolean;
  path?: string;
  modelPayload: boolean;
}

export interface NodusConfiguration {
  project: ProjectConfiguration;
  model: ModelConfiguration;
  agent: AgentConfiguration;
  knowledge: KnowledgeConfiguration;
  logging: LoggingConfiguration;
}
