import type { WorkerConfiguration } from '@engine/Type/EngineConfiguration.js';
import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';

export interface ScenarioDefinition {
  id: string;
  task: string;
  /** Seed copied into an isolated temporary project before inline overrides are applied. */
  fixtureRoot?: string;
  files?: Record<string, string>;
  modelResponses: string[];
  runtime?: WorkerConfiguration;
  model?: Partial<ModelConfiguration>;
}

export function scenario(definition: ScenarioDefinition): ScenarioDefinition {
  return definition;
}
