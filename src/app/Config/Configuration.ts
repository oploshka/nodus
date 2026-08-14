import type { ProjectConfiguration, WorkerConfiguration } from '@engine/Type/EngineConfiguration.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import type { ValidationConfiguration } from '@engine/Validation/ValidationConfiguration.js';
import type { EngineTestConfiguration } from '@engine/EngineTest/EngineTestConfiguration.js';
import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';

/**
 * Configuration shape accepted by the application composition layer.
 * Runtime defaults belong to the components that own their meaning, not here.
 */
export interface AppConfiguration {
  project: ProjectConfiguration;
  model: ModelConfiguration;
  runtime?: WorkerConfiguration;
  /** Project-level tests executed by Engine after accumulated Edit is applied. */
  engineTest?: EngineTestConfiguration;
  /** Temporary compatibility configuration from Validation v2. */
  validation?: ValidationConfiguration;
  language?: Partial<LanguageConfiguration>;
}
