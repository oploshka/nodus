import { ModelResponseFormatError, type ModelResponseFormatter } from './ModelResponseFormatter.js';

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

export type EditFileModelResponse =
  | { status: 'completed'; action: 'patch'; path: string; hunks: UnifiedDiffHunk[] }
  | { status: 'completed'; action: 'write'; path: string; content: string }
  | { status: 'completed'; action: 'delete'; path: string };

export class EditFileResponseFormatter implements ModelResponseFormatter<EditFileModelResponse> {
  public readonly id = 'edit-file';
  public constructor(private readonly expectedPath: string) {}

  public instructions(): string {
    return [
      'Return ONLY this raw protocol.',
      'Preferred minimal edit:',
      'STATUS completed',
      'ACTION patch',
      `PATH ${this.expectedPath}`,
      'DIFF',
      `--- a/${this.expectedPath}`,
      `+++ b/${this.expectedPath}`,
      '@@ -<oldLine>,<oldCount> +<newLine>,<newCount> @@',
      ' <unchanged context>',
      '-<removed line>',
      '+<added line>',
      '',
      'Fallback only when a patch is unsafe:',
      'STATUS completed',
      'ACTION write',
      `PATH ${this.expectedPath}`,
      'CONTENT',
      '<complete file>',
    ].join('\n');
  }

  public parse(content: string): EditFileModelResponse {
    const normalized = content.replace(/\r\n/g, '\n');
    const status = this.line(normalized, 'STATUS');
    if (status !== 'completed') this.fail(`STATUS must be completed, received: ${String(status)}`, content);

    const action = (this.line(normalized, 'ACTION') ?? 'patch').toLowerCase();
    const path = this.line(normalized, 'PATH');
    if (!path) this.fail('PATH is required', content);
    if (path !== this.expectedPath) this.fail(`Path mismatch: expected ${this.expectedPath}, received ${path}`, content);

    if (action === 'delete') return { status: 'completed', action: 'delete', path };
    if (action === 'write') {
      const marker = /^CONTENT\s*$/m.exec(normalized);
      if (!marker) this.fail('Write response requires CONTENT', content);
      return {
        status: 'completed',
        action: 'write',
        path,
        content: this.stripFence(normalized.slice(marker.index + marker[0].length).replace(/^\n/, '')),
      };
    }
    if (action === 'patch') return { status: 'completed', action: 'patch', path, hunks: this.parseDiff(normalized, content) };
    this.fail(`Unsupported edit action: ${action}`, content);
  }

  private parseDiff(content: string, original: string): UnifiedDiffHunk[] {
    const marker = /^DIFF\s*$/m.exec(content);
    if (!marker) this.fail('Patch response requires DIFF', original);
    const diff = this.stripFence(content.slice(marker.index + marker[0].length).replace(/^\n/, ''));
    const lines = diff.split('\n');
    const hunks: UnifiedDiffHunk[] = [];
    let index = 0;
    while (index < lines.length) {
      const header = lines[index].match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!header) { index += 1; continue; }
      const hunk: UnifiedDiffHunk = {
        oldStart: Number(header[1]), oldCount: Number(header[2] ?? 1),
        newStart: Number(header[3]), newCount: Number(header[4] ?? 1), lines: [],
      };
      index += 1;
      while (index < lines.length && !lines[index].startsWith('@@ ')) {
        const line = lines[index];
        if (/^(--- |\+\+\+ |diff --git )/.test(line)) { index += 1; continue; }
        if (line === '\ No newline at end of file') { index += 1; continue; }
        const prefix = line[0];
        if (prefix === ' ') hunk.lines.push({ type: 'context', text: line.slice(1) });
        else if (prefix === '-') hunk.lines.push({ type: 'remove', text: line.slice(1) });
        else if (prefix === '+') hunk.lines.push({ type: 'add', text: line.slice(1) });
        else if (line.length === 0) { index += 1; break; }
        else break;
        index += 1;
      }
      if (hunk.lines.length === 0) this.fail('Unified diff hunk is empty', original);
      hunks.push(hunk);
    }
    if (hunks.length === 0) this.fail('Patch response requires at least one hunk', original);
    return hunks;
  }

  private line(content: string, name: string): string | undefined {
    return content.match(new RegExp(`^${name}\\s+(.+)$`, 'mi'))?.[1]?.trim();
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
    throw new ModelResponseFormatError(this.id, message, content.slice(0, 500));
  }
}
