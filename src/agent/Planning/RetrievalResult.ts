// RetrievalResult.ts
import type { ToolContextEntry } from '@core/Execution/Execution';
import type { RetrievalMatch } from '@model/Result/OperationResult';

export interface RetrievalRoundAssessment {
  match: RetrievalMatch;
  entries: ToolContextEntry[];
  reason: string;
}

export class RetrievalResultClassifier {
  public classify(exactEntries: ToolContextEntry[], relatedEntries: ToolContextEntry[]): RetrievalRoundAssessment {
    const exact = exactEntries.filter((entry) => this.useful(entry));
    if (exact.length > 0) {
      return { match: 'exact', entries: exact, reason: 'Exact retrieval queries returned concrete project evidence.' };
    }

    const related = relatedEntries.filter((entry) => this.useful(entry));
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
}
