import type { ProjectConfiguration } from '../../engine/project/ProjectConfiguration.js';
import type { WorkerConfiguration } from '../../engine/worker/WorkerConfiguration.js';
import type { ModelConfiguration } from '../../model/Configuration/ModelConfiguration.js';

export interface AppConfiguration {
  project: ProjectConfiguration;
  model: ModelConfiguration;
  runtime?: WorkerConfiguration;
}

export type { ProjectConfiguration, WorkerConfiguration as RuntimeConfiguration, ModelConfiguration };
