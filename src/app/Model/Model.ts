import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter.js';
import { KoboldCppResponseStructureAdapter } from '@model/Response/Structure/KoboldCppResponseStructureAdapter.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';

export function createModel(
  configuration: ModelConfiguration,
  adapter?: ModelAdapter,
): ModelRunner {
  const modelAdapter = adapter ?? new OpenAICompatibleModelAdapter(
    configuration.endpoint,
    configuration.apiKey,
    configuration.requestTimeoutMs,
  );
  const responseStructure = configuration.provider === 'koboldcpp'
    ? new KoboldCppResponseStructureAdapter()
    : undefined;

  return new ModelRunner(modelAdapter, configuration, responseStructure);
}
