// ModelCallProfile.ts
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

/**
 * Shared configuration shape for every LLM invocation in Nodus.
 *
 * Prompt settings describe what the model should do.
 * Model settings describe how generation should run.
 * Call-site/runtime code remains responsible for execution semantics.
 *
 * Future provider/model knobs belong in ModelSettings when Nodus actually
 * supports them, instead of being scattered through call sites.
 */
export interface ModelCallProfile {
  prompt: PromptSettings;
  model: ModelSettings;
}
