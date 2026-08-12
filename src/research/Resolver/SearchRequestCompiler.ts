// SearchRequestCompiler.ts
import type { PlanStep } from '@planner/TaskPlan';
import { parseWorkflowDataRef } from '@planner/WorkflowData';
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
  'read',
  'current',
]);

const SUBJECT_STOP_WORDS = new Set([
  'the', 'a', 'an', 'by', 'for', 'from', 'in', 'of', 'to', 'used', 'using', 'exposed', 'source', 'definition',
  'definitions', 'usage', 'usages', 'reference', 'references', 'example', 'examples', 'find', 'files', 'file', 'current',
  'required', 'project', 'existing', 'state', 'without', 'while', 'handling', 'available', 'unavailable', 'read', 'only',
]);

export interface CompiledSearchRequest {
  exact: ToolCallRequest[];
  related: ToolCallRequest[];
  exactQueries: string[];
  relatedQueries: string[];
}

export class SearchRequestCompiler {
  public compile(step: PlanStep, preferredQueries: string[] = []): CompiledSearchRequest {
    const sourceHints = this.unique(step.sourceHints ?? []).slice(0, 4);

    if (step.action === 'find-files' && sourceHints.length > 0) {
      return {
        exact: sourceHints.slice(0, 5).map((path) => ({ tool: 'file-system', input: { action: 'exists', path } })),
        related: [],
        exactQueries: sourceHints,
        relatedQueries: [],
      };
    }

    const exactQueries = this.exactQueryCandidates(step, preferredQueries).slice(0, 4);
    const relatedQueries = this.relatedQueryCandidates(step, exactQueries).slice(0, 4);
    const paths = sourceHints.length > 0 ? sourceHints : ['.'];

    return {
      exact: this.calls(paths, exactQueries, 5),
      related: this.calls(paths, relatedQueries, 5),
      exactQueries,
      relatedQueries,
    };
  }

  public supportsDeterministicRequirement(step: PlanStep): boolean {
    return step.outputs.some((output) => {
      try { return parseWorkflowDataRef(output).kind === 'evidence'; } catch { return false; }
    });
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

  private exactQueryCandidates(step: PlanStep, preferredQueries: string[]): string[] {
    const candidates: string[] = [...preferredQueries];

    for (const output of step.outputs) {
      try {
        const ref = parseWorkflowDataRef(output);
        const segments = ref.key
          .split('.')
          .flatMap((segment) => this.identifierParts(segment))
          .map((segment) => segment.trim())
          .filter((segment) => segment && !SEMANTIC_SEGMENTS.has(segment.toLowerCase()));
        if (segments.length === 0) continue;
        if (segments.length >= 2) candidates.push(this.camelCase(segments));
        candidates.push(segments.at(-1) ?? '');
        if (segments.length >= 3) candidates.push(this.camelCase(segments.slice(-2)));
        candidates.push(...segments.slice().reverse());
      } catch {
        // Legacy/untyped outputs fall back to subject-derived related queries.
      }
    }

    return this.unique(candidates.map((value) => value.trim()).filter(Boolean));
  }

  private relatedQueryCandidates(step: PlanStep, exactQueries: string[]): string[] {
    const exact = new Set(exactQueries.map((value) => value.toLowerCase()));
    const subject = step.subject ?? step.goal;
    const subjectWithoutPaths = subject.replace(/\bsrc\/[\w./-]+\b/gi, ' ');
    const tokens = subjectWithoutPaths.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    const candidates: string[] = [];
    for (const token of tokens) {
      if (token.length < 2 || SUBJECT_STOP_WORDS.has(token.toLowerCase())) continue;
      if (exact.has(token.toLowerCase())) continue;
      candidates.push(token);
    }

    for (const contract of step.requirements ?? []) {
      for (const hint of contract.sourceHints ?? []) {
        const basename = hint.split('/').at(-1)?.replace(/\.[^.]+$/, '');
        if (basename && !exact.has(basename.toLowerCase())) candidates.push(basename);
      }
    }

    return this.unique(candidates);
  }

  private calls(paths: string[], queries: string[], limit: number): ToolCallRequest[] {
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
        if (calls.length >= limit) return calls;
      }
    }
    return calls;
  }


  private identifierParts(value: string): string[] {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^A-Za-z0-9_]+/g, ' ')
      .split(/[\s_]+/)
      .map((part) => part.trim())
      .filter(Boolean);
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
