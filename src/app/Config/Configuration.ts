import type { sTargetConfig, WorkerConfiguration } from '@engine/Type/EngineConfiguration.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';

export interface sAutomationConfiguration {
  /** Versioned user automation package. Runtime cache/log/state stay outside this directory. */
  root: string;
}

/** Application configuration. Runtime behavior is supplied by the automation package. */
export interface AppConfiguration {
  target: sTargetConfig;
  model: ModelConfiguration;
  automation?: sAutomationConfiguration;
  runtime?: WorkerConfiguration;
  language?: Partial<LanguageConfiguration>;
}
