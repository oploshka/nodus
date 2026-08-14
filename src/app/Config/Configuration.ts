import type { ProjectConfiguration, WorkerConfiguration } from '@engine/Type/EngineConfiguration.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';

/**
 * Configuration shape accepted by the application composition layer.
 * Runtime defaults belong to the components that own their meaning, not here.
 */
export interface AppConfiguration {
  project: ProjectConfiguration;
  model: ModelConfiguration;
  runtime?: WorkerConfiguration;
  language?: Partial<LanguageConfiguration>;
}
