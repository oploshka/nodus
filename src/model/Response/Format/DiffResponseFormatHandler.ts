import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import { ModelResponseFormatError } from '@model/Response/ModelResponseSchema.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';

export interface UnifiedDiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
}

export interface UnifiedDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: UnifiedDiffLine[];
}

export interface UnifiedDiffDocument {
  oldPath: string;
  newPath: string;
  hunks: UnifiedDiffHunk[];
}

export class DiffResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Diff;

  public instructions(): string {
    return [
      'Return ONLY a unified diff.',
      'Do not add STATUS/ACTION wrappers, explanations, or markdown fences.',
      'Use standard --- a/<path>, +++ b/<path>, and @@ hunk headers.',
      'Include enough unchanged context for deterministic application.',
    ].join('\n');
  }

  public parse(content: string): unknown {
    const normalized = this.stripFence(content.replace(/\r\n/g, '\n').trim());
    const lines = normalized.split('\n');
    const oldHeader = lines.find((line) => line.startsWith('--- '));
    const newHeader = lines.find((line) => line.startsWith('+++ '));
    if (!oldHeader || !newHeader) this.fail('Unified diff requires --- and +++ file headers', content);

    const oldPath = this.cleanPath(oldHeader.slice(4).trim());
    const newPath = this.cleanPath(newHeader.slice(4).trim());
    const hunks: UnifiedDiffHunk[] = [];
    let index = 0;

    while (index < lines.length) {
      const header = lines[index].match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!header) { index += 1; continue; }
      const hunk: UnifiedDiffHunk = {
        oldStart: Number(header[1]),
        oldCount: Number(header[2] ?? 1),
        newStart: Number(header[3]),
        newCount: Number(header[4] ?? 1),
        lines: [],
      };
      index += 1;
      while (index < lines.length && !lines[index].startsWith('@@ ')) {
        const line = lines[index];
        if (/^(--- |\+\+\+ |diff --git )/.test(line)) { index += 1; continue; }
        if (line === '\\ No newline at end of file') { index += 1; continue; }
        const prefix = line[0];
        if (prefix === ' ') hunk.lines.push({ type: 'context', text: line.slice(1) });
        else if (prefix === '-') hunk.lines.push({ type: 'remove', text: line.slice(1) });
        else if (prefix === '+') hunk.lines.push({ type: 'add', text: line.slice(1) });
        else if (line.length === 0) { index += 1; break; }
        else break;
        index += 1;
      }
      if (hunk.lines.length === 0) this.fail('Unified diff hunk is empty', content);
      hunks.push(hunk);
    }

    if (hunks.length === 0) this.fail('Unified diff requires at least one hunk', content);
    return { path: oldPath === newPath ? oldPath : newPath, oldPath, newPath, hunks };
  }

  private cleanPath(value: string): string {
    const path = value.split(/\s+/)[0];
    return path.replace(/^[ab]\//, '');
  }

  private stripFence(content: string): string {
    const opening = content.match(/^```[^\n]*\n/);
    if (!opening) return content;
    let value = content.slice(opening[0].length);
    const closing = value.match(/\n```\s*$/);
    if (closing) value = value.slice(0, closing.index);
    return value;
  }

  private fail(message: string, content: string): never {
    throw new ModelResponseFormatError('diff', message, content.slice(0, 500));
  }
}
