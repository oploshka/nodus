// ModelFactory.ts

import type { Model } from '@model/Model';
import type { ModelConfiguration } from '@model/Configuration/ModelConfiguration';

export class ModelFactory {
  create(
    configuration: ModelConfiguration,
    adapter: Model['adapter'],
  ): Model {
    return {
      name: configuration.model,
      adapter,
    };
  }
}