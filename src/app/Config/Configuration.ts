import type { sTargetConfig, WorkerConfiguration } from '@engine/Type/EngineConfiguration.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import type { EngineTestConfiguration } from '@engine/EngineTest/EngineTestConfiguration.js';
import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';

export interface sAutomationConfiguration {
  /** Versioned user automation package. Runtime cache/log/state stay outside this directory. */
  root: string;
}

/**
 * Configuration shape accepted by the application composition layer.
 * Runtime defaults belong to the components that own their meaning, not here.
 */
export interface AppConfiguration {
  target: sTargetConfig;
  model: ModelConfiguration;
  /** Startup pointer to the user-controlled automation package. */
  automation?: sAutomationConfiguration;
  runtime?: WorkerConfiguration;
  /** Target-level tests executed by Engine after accumulated Edit is applied. */
  engineTest?: EngineTestConfiguration;
  language?: Partial<LanguageConfiguration>;
}
