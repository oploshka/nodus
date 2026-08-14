export interface PromptSettings {
  identity?: string;
  purpose: string;
  rules: string[];
  contextRules?: string[];
  returnFormat?: string;
}

export interface ModelSettings {
  temperature?: number;
  maxTokens?: number;
}

export interface ModelCallProfile {
  prompt: PromptSettings;
  model: ModelSettings;
}
