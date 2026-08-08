// ConfigurationLoader.ts

import type { Configuration } from '@core/Configuration/Configuration';

export class ConfigurationLoader {
  load(): Configuration {
    return {
      projectRoot: process.cwd(),
      model: {
        provider: 'mock',
        model: 'mock-model',
      },
      agent: {
        maxSteps: 10,
      },
    };
  }
}