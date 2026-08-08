// ContextBudget.ts
import type { ExecutionEvent, ToolContextEntry } from '@core/Execution/Execution';

export interface ContextBudgetProfile {
  historyEntries: number;
  maxHistoryChars: number;
  indexedFiles: number;
  maxToolEntries: number;
  maxToolEntryChars: number;
  maxToolContextChars: number;
}

const DEFAULT_PROFILE: ContextBudgetProfile = {
  historyEntries: 8,
  maxHistoryChars: 6_000,
  indexedFiles: 50,
  maxToolEntries: 3,
  maxToolEntryChars: 6_000,
  maxToolContextChars: 12_000,
};

const PROFILES: Record<string, ContextBudgetProfile> = {
  plan: {
    historyEntries: 5,
    maxHistoryChars: 3_000,
    indexedFiles: 60,
    maxToolEntries: 0,
    maxToolEntryChars: 0,
    maxToolContextChars: 0,
  },
  understand: {
    historyEntries: 6,
    maxHistoryChars: 4_000,
    indexedFiles: 50,
    maxToolEntries: 3,
    maxToolEntryChars: 5_000,
    maxToolContextChars: 10_000,
  },
  finalize: {
    historyEntries: 10,
    maxHistoryChars: 7_000,
    indexedFiles: 30,
    maxToolEntries: 0,
    maxToolEntryChars: 0,
    maxToolContextChars: 0,
  },
  implement: {
    historyEntries: 10,
    maxHistoryChars: 7_000,
    indexedFiles: 50,
    maxToolEntries: 4,
    maxToolEntryChars: 7_000,
    maxToolContextChars: 18_000,
  },
};

const RELEVANT_HISTORY_TYPES = new Set([
  'task',
  'operation-started',
  'operation-result',
  'operation-transition',
  'model-error',
  'missing-operation',
  'operation-fallback',
  'human-question',
  'human-answer',
  'change-applied',
]);

export class ContextBudget {
  public profile(operationId: string): ContextBudgetProfile {
    return PROFILES[operationId] ?? DEFAULT_PROFILE;
  }

  /**
   * Execution history is control-plane context, not a transcript dump.
   * Tool-result events are deliberately excluded because the current raw
   * results are supplied through toolContext and old tool payloads should not
   * bias the model into copying event-shaped JSON.
   */
  public history(history: ExecutionEvent[], operationId: string): ExecutionEvent[] {
    const profile = this.profile(operationId);
    const candidates = history
      .filter((event) => RELEVANT_HISTORY_TYPES.has(event.type))
      .slice(-profile.historyEntries);

    const selected: ExecutionEvent[] = [];
    let used = 0;

    // Keep the newest control events first, then restore chronological order.
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const event = candidates[index];
      if (!event) continue;
      const size = this.estimateChars(event);
      if (selected.length > 0 && used + size > profile.maxHistoryChars) {
        continue;
      }
      selected.push(event);
      used += size;
    }

    return selected.reverse();
  }

  /**
   * Raw tool results are budgeted per complete entry. Text file contents may
   * be clipped, but the surrounding ToolContextEntry shape is always kept
   * valid and we never slice the assembled model prompt.
   */
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
        const size = this.estimateChars(entry);
        if (result.length > 0 && size > remaining) break;
        result.push(entry);
        remaining -= size;
        continue;
      }

      const envelopeSize = this.estimateChars({
        call: entry.call,
        result: { ...entry.result, data: '' },
      });
      const availableForData = Math.max(0, remaining - envelopeSize);
      const allowed = Math.min(profile.maxToolEntryChars, availableForData);
      if (allowed <= 0 && result.length > 0) break;

      const truncated = data.length > allowed;
      const suffix = '\n\n[truncated by Nodus context budget]';
      const clipped = truncated
        ? `${data.slice(0, Math.max(0, allowed - suffix.length))}${suffix}`
        : data;

      const safeEntry: ToolContextEntry = {
        call: entry.call,
        result: {
          ...entry.result,
          data: clipped,
        },
      };

      const safeSize = this.estimateChars(safeEntry);
      if (result.length > 0 && safeSize > remaining) break;
      result.push(safeEntry);
      remaining -= safeSize;
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
