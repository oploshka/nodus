// MemoryStore.ts

import type { Memory } from '@core/Memory/Memory';

export class MemoryStore {
  private memory: Memory = {
    plannedSteps: [],
    completedSteps: [],
    lastFilesModified: [],
    triedFixes: [],
    data: {},
  };

  get(): Memory {
    return this.memory;
  }

  set(memory: Memory): void {
    this.memory = memory;
  }

  update(patch: Partial<Memory>): void {
    this.memory = {
      ...this.memory,
      ...patch,
    };
  }
}