// Configuration.ts
export type ScanMode = 'manual' | 'on-open' | 'disabled';
export type KnowledgeGenerationMode = 'disabled' | 'manual';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ModelProvider = 'mock' | 'openai-compatible';
export type ConsoleMode = 'quiet' | 'normal' | 'verbose';

export interface ProjectConfiguration {
  id: string;
  root: string;
  scanMode: ScanMode;
  cachePath?: string;
  clearCacheOnStart: boolean;
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

export type ResponseLanguage = 'auto' | string;
export type InternalLanguage = 'original' | 'en';

export interface AgentConfiguration {
  maxSteps: number;
  responseLanguage: ResponseLanguage;
  internalLanguage: InternalLanguage;
}

export interface KnowledgeConfiguration {
  generationMode: KnowledgeGenerationMode;
}

export interface LoggingConfiguration {
  level: 'debug' | 'info' | 'warn' | 'error';
  console: boolean;
  file: boolean;
  path?: string;
  modelPayload: boolean;
  payloadPath?: string;
  executionPath?: string;
  consoleMode: ConsoleMode;
  colors: boolean;
  clearOnStart: boolean;
}

export interface NodusConfiguration {
  project: ProjectConfiguration;
  model: ModelConfiguration;
  agent: AgentConfiguration;
  knowledge: KnowledgeConfiguration;
  logging: LoggingConfiguration;
}
