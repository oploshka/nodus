// SearchRequestCompiler.ts
import type { PlanStep } from '@agent/Planning/TaskPlan';
import { parseWorkflowDataRef } from '@agent/Planning/WorkflowData';
import type { ToolCallRequest } from '@model/Result/OperationResult';

const SEMANTIC_SEGMENTS = new Set([
  'definition',
  'definitions',
  'usage',
  'usages',
  'reference',
  'references',
  'example',
  'examples',
  'source',
  'access',
  'pattern',
  'result',
]);

const SUBJECT_STOP_WORDS = new Set([
  'the', 'a', 'an', 'by', 'for', 'from', 'in', 'of', 'to', 'used', 'using', 'exposed', 'source', 'definition',
  'definitions', 'usage', 'usages', 'reference', 'references', 'example', 'examples', 'find', 'files', 'file', 'current',
]);

export class SearchRequestCompiler {
  public compile(step: PlanStep, preferredQueries: string[] = []): ToolCallRequest[] {
    const sourceHints = this.unique(step.sourceHints ?? []).slice(0, 4);

    if (step.action === 'find-files' && sourceHints.length > 0) {
      return sourceHints.slice(0, 5).map((path) => ({
        tool: 'file-system',
        input: { action: 'exists', path },
      }));
    }

    const queries = this.queryCandidates(step, preferredQueries);
    if (queries.length === 0) return [];

    const paths = sourceHints.length > 0 ? sourceHints : ['.'];
    const calls: ToolCallRequest[] = [];
    for (const path of paths) {
      for (const query of queries) {
        calls.push({
          tool: 'search',
          input: {
            query,
            path,
            maxResults: 24,
            caseSensitive: false,
          },
        });
        if (calls.length >= 5) return calls;
      }
    }
    return calls;
  }

  public queriesFromModelData(data: unknown): string[] {
    if (!data || typeof data !== 'object') return [];
    const queries = (data as Record<string, unknown>).queries;
    if (!Array.isArray(queries)) return [];
    return this.unique(queries.map(String).map((value) => value.trim()).filter(Boolean)).slice(0, 4);
  }

  public queriesFromLegacyToolCalls(calls: ToolCallRequest[]): string[] {
    return this.unique(calls.flatMap((call) => {
      if (call.tool !== 'search') return [];
      return typeof call.input.query === 'string' ? [call.input.query.trim()] : [];
    }).filter(Boolean)).slice(0, 4);
  }

  private queryCandidates(step: PlanStep, preferredQueries: string[]): string[] {
    const candidates: string[] = [...preferredQueries];

    for (const output of step.outputs) {
      try {
        const ref = parseWorkflowDataRef(output);
        const segments = ref.key
          .split('.')
          .map((segment) => segment.trim())
          .filter((segment) => segment && !SEMANTIC_SEGMENTS.has(segment.toLowerCase()));
        if (segments.length === 0) continue;
        if (segments.length >= 2) candidates.push(this.camelCase(segments));
        candidates.push(segments.at(-1) ?? '');
        if (segments.length >= 2) candidates.push(segments.at(-2) ?? '');
      } catch {
        // Legacy/untyped output keys are allowed. Subject-derived candidates below remain available.
      }
    }

    const subject = step.subject ?? step.goal;
    const subjectWithoutPaths = subject.replace(/\bsrc\/[\w./-]+\b/gi, ' ');
    const tokens = subjectWithoutPaths.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    for (const token of tokens) {
      if (token.length < 2 || SUBJECT_STOP_WORDS.has(token.toLowerCase())) continue;
      candidates.push(token);
    }

    return this.unique(candidates.map((value) => value.trim()).filter(Boolean)).slice(0, 4);
  }

  private camelCase(segments: string[]): string {
    const [first = '', ...rest] = segments;
    return first + rest.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
  }

  private unique(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }
}
