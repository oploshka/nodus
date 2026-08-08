// Summarizer.ts

import type { Summary } from '@core/Summary/Summary';

export class Summarizer {
  create(task: string): Summary {
    return {
      task,
      changes: [],
      completedSteps: [],
      warnings: [],
    };
  }
}