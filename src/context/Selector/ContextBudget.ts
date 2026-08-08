// ContextBudget.ts
import type { ToolContextEntry } from '@core/Execution/Execution';
import type { ExecutionEvent } from '@core/Execution/Execution';

export interface ContextBudgetProfile {
  historyEntries: number;
  indexedFiles: number;
  maxToolEntries: number;
  maxToolEntryChars: number;
  maxToolContextChars: number;
}

const DEFAULT_PROFILE: ContextBudgetProfile = {
  historyEntries: 12,
  indexedFiles: 80,
  maxToolEntries: 3,
  maxToolEntryChars: 8_000,
  maxToolContextChars: 18_000,
};

const PROFILES: Record<string, ContextBudgetProfile> = {
  plan: {
    historyEntries: 8,
    indexedFiles: 80,
    maxToolEntries: 0,
    maxToolEntryChars: 0,
    maxToolContextChars: 0,
  },
  understand: {
    historyEntries: 12,
    indexedFiles: 80,
    maxToolEntries: 3,
    maxToolEntryChars: 7_000,
    maxToolContextChars: 16_000,
  },
  finalize: {
    historyEntries: 20,
    indexedFiles: 50,
    maxToolEntries: 0,
    maxToolEntryChars: 0,
    maxToolContextChars: 0,
  },
  implement: {
    historyEntries: 16,
    indexedFiles: 80,
    maxToolEntries: 4,
    maxToolEntryChars: 9_000,
    maxToolContextChars: 24_000,
  },
};

export class ContextBudget {
  public profile(operationId: string): ContextBudgetProfile {
    return PROFILES[operationId] ?? DEFAULT_PROFILE;
  }

  public history(history: ExecutionEvent[], operationId: string): ExecutionEvent[] {
    const profile = this.profile(operationId);
    return history.slice(-profile.historyEntries);
  }

  public toolContext(entries: ToolContextEntry[], operationId: string): ToolContextEntry[] {
    const profile = this.profile(operationId);
    if (profile.maxToolEntries <= 0 || profile.maxToolContextChars <= 0) {
      return [];
    }

    const result: ToolContextEntry[] = [];
    let remaining = profile.maxToolContextChars;

    for (const entry of entries.slice(0, profile.maxToolEntries)) {
      if (remaining <= 0) break;

      const data = entry.result.data;
      if (typeof data !== 'string') {
        result.push(entry);
        remaining -= this.estimateChars(entry.result);
        continue;
      }

      const allowed = Math.max(0, Math.min(profile.maxToolEntryChars, remaining));
      const truncated = data.length > allowed;
      const clipped = truncated
        ? `${data.slice(0, allowed)}\n\n[truncated by Nodus context budget]`
        : data;

      result.push({
        call: entry.call,
        result: {
          ...entry.result,
          data: clipped,
        },
      });

      remaining -= clipped.length;
    }

    return result;
  }

  private estimateChars(value: unknown): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
}
