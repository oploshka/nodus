import type { FileChange, UnifiedDiffHunk } from './ChangeSet.js';

export class EditFileProtocol {
  public parse(content: string, expectedPath: string): FileChange {
    const normalized = content.replace(/\r\n/g, '\n');
    const status = this.line(normalized, 'STATUS');
    if (status !== 'completed') throw new Error(`Edit response STATUS must be completed, received: ${String(status)}`);
    const action = (this.line(normalized, 'ACTION') ?? 'patch').toLowerCase();
    const path = this.line(normalized, 'PATH');
    if (!path) throw new Error('Edit response requires PATH');
    if (path !== expectedPath) throw new Error(`Edit path mismatch: expected ${expectedPath}, received ${path}`);

    if (action === 'delete') return { type: 'delete', path };
    if (action === 'write') {
      const marker = /^CONTENT\s*$/m.exec(normalized);
      if (!marker) throw new Error('Write response requires CONTENT');
      return { type: 'write', path, content: this.stripFence(normalized.slice(marker.index + marker[0].length).replace(/^\n/, '')) };
    }
    if (action === 'patch') return { type: 'patch', path, hunks: this.parseDiff(normalized) };
    throw new Error(`Unsupported edit action: ${action}`);
  }

  public instructions(path: string): string {
    return [
      'Return ONLY this raw protocol.',
      'Preferred minimal edit:',
      'STATUS completed',
      'ACTION patch',
      `PATH ${path}`,
      'DIFF',
      `--- a/${path}`,
      `+++ b/${path}`,
      '@@ -<oldLine>,<oldCount> +<newLine>,<newCount> @@',
      ' <unchanged context>',
      '-<removed line>',
      '+<added line>',
      '',
      'Fallback only when a patch is unsafe:',
      'STATUS completed',
      'ACTION write',
      `PATH ${path}`,
      'CONTENT',
      '<complete file>',
    ].join('\n');
  }

  private parseDiff(content: string): UnifiedDiffHunk[] {
    const marker = /^DIFF\s*$/m.exec(content);
    if (!marker) throw new Error('Patch response requires DIFF');
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
        if (line === '\\ No newline at end of file') { index += 1; continue; }
        const prefix = line[0];
        if (prefix === ' ') hunk.lines.push({ type: 'context', text: line.slice(1) });
        else if (prefix === '-') hunk.lines.push({ type: 'remove', text: line.slice(1) });
        else if (prefix === '+') hunk.lines.push({ type: 'add', text: line.slice(1) });
        else if (line.length === 0) { index += 1; break; }
        else break;
        index += 1;
      }
      if (hunk.lines.length === 0) throw new Error('Unified diff hunk is empty');
      hunks.push(hunk);
    }
    if (hunks.length === 0) throw new Error('Patch response requires at least one hunk');
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
}
