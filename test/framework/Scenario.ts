import type { ModelConfiguration, RuntimeConfiguration } from '../../src/app/config/Configuration.js';

export interface ScenarioDefinition {
  id: string;
  task: string;
  files: Record<string, string>;
  modelResponses: string[];
  runtime?: RuntimeConfiguration;
  model?: Partial<ModelConfiguration>;
}

export function scenario(definition: ScenarioDefinition): ScenarioDefinition {
  return definition;
}
