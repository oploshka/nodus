import type { UnifiedDiffDocument, UnifiedDiffHunk } from '../format/DiffResponseFormatHandler.js';
import { ModelResponseFormatError, type ModelResponseSchema } from '../ModelResponseSchema.js';

export interface UnifiedDiffModelResponse {
  path: string;
  hunks: UnifiedDiffHunk[];
}

export class UnifiedDiffResponseSchema implements ModelResponseSchema<UnifiedDiffModelResponse> {
  public readonly id = 'unified-diff';
  public constructor(private readonly expectedPath: string) {}

  public instructions(): string {
    return `The diff must modify exactly this file: ${this.expectedPath}`;
  }

  public decode(value: unknown): UnifiedDiffModelResponse {
    if (!value || typeof value !== 'object') this.fail('Expected parsed unified diff document', value);
    const diff = value as UnifiedDiffDocument;
    if (!Array.isArray(diff.hunks) || diff.hunks.length === 0) this.fail('Diff contains no hunks', value);
    if (diff.oldPath !== this.expectedPath || diff.newPath !== this.expectedPath) {
      this.fail(`Path mismatch: expected ${this.expectedPath}, received ${diff.oldPath} -> ${diff.newPath}`, value);
    }
    return { path: this.expectedPath, hunks: diff.hunks };
  }

  private fail(message: string, value: unknown): never {
    throw new ModelResponseFormatError(this.id, message, JSON.stringify(value).slice(0, 500));
  }
}
