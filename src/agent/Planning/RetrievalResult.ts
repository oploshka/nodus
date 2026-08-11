// RetrievalResult.ts
import type { ToolContextEntry } from '@core/Execution/Execution';
import type { RetrievalMatch } from '@model/Result/OperationResult';

export interface RetrievalRoundAssessment {
  match: RetrievalMatch;
  entries: ToolContextEntry[];
  reason: string;
}

export class RetrievalResultClassifier {
  public classify(exactEntries: ToolContextEntry[], relatedEntries: ToolContextEntry[], constraints: string[] = []): RetrievalRoundAssessment {
    const exact = this.qualify(exactEntries, constraints).filter((entry) => this.useful(entry));
    if (exact.length > 0) {
      return { match: 'exact', entries: exact, reason: 'Exact retrieval queries returned concrete project evidence.' };
    }

    const related = this.qualify(relatedEntries, constraints).filter((entry) => this.useful(entry));
    if (related.length > 0) {
      return { match: 'related', entries: related, reason: 'Only broader related retrieval queries returned project evidence.' };
    }

    return { match: 'missing', entries: [], reason: 'No exact or related project evidence was found.' };
  }

  public useful(entry: ToolContextEntry): boolean {
    if (!entry.result.ok) return false;
    const data = entry.result.data;
    if (entry.call.tool === 'file-system' && String(entry.call.input.action ?? '') === 'exists') {
      return Boolean(data && typeof data === 'object' && (data as Record<string, unknown>).exists === true);
    }
    if (Array.isArray(data)) return data.length > 0;
    if (typeof data === 'string') return data.trim().length > 0;
    if (data && typeof data === 'object') return Object.keys(data as Record<string, unknown>).length > 0;
    return data !== undefined && data !== null;
  }

  private qualify(entries: ToolContextEntry[], constraints: string[]): ToolContextEntry[] {
    const constrainedRead = constraints.some((constraint) => [
      'read-only',
      'existing-state',
      'no-side-effects',
      'must-not-scan-or-refresh',
    ].includes(constraint));
    if (!constrainedRead) return entries;

    return entries.map((entry) => {
      if (!Array.isArray(entry.result.data)) return entry;
      const data = entry.result.data.filter((match) => {
        if (!match || typeof match !== 'object') return true;
        const text = String((match as Record<string, unknown>).text ?? '');
        return !/\b(?:scan|refresh)\s*\(/i.test(text);
      });
      return { ...entry, result: { ...entry.result, data } };
    });
  }
}
