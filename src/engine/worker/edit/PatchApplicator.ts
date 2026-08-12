import type { UnifiedDiffHunk } from '../../../model/Response/EditFileResponseFormatter.js';

export class PatchApplicator {
  public apply(content: string, hunks: UnifiedDiffHunk[], path: string): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const normalized = content.replace(/\r\n/g, '\n');
    const hadTrailingNewline = normalized.endsWith('\n');
    const source = normalized.split('\n');
    if (hadTrailingNewline) source.pop();

    const resolved = hunks.map((hunk) => ({ hunk, index: this.resolve(source, hunk, path) }));
    resolved.sort((a, b) => b.index - a.index);
    for (let i = 1; i < resolved.length; i += 1) {
      const lower = resolved[i - 1];
      const upper = resolved[i];
      if (upper.index + this.oldLines(upper.hunk).length > lower.index) throw new Error(`Patch hunks overlap in ${path}`);
    }

    const result = [...source];
    for (const { hunk, index } of resolved) {
      const oldLines = this.oldLines(hunk);
      const newLines = hunk.lines.filter((line) => line.type !== 'remove').map((line) => line.text);
      if (!this.same(result.slice(index, index + oldLines.length), oldLines)) throw new Error(`Patch context changed in ${path}`);
      result.splice(index, oldLines.length, ...newLines);
    }
    const output = result.join('\n') + (hadTrailingNewline ? '\n' : '');
    return eol === '\r\n' ? output.replace(/\n/g, '\r\n') : output;
  }

  private resolve(source: string[], hunk: UnifiedDiffHunk, path: string): number {
    const oldLines = this.oldLines(hunk);
    const expected = Math.max(0, hunk.oldStart - 1);
    if (this.same(source.slice(expected, expected + oldLines.length), oldLines)) return expected;
    const candidates: number[] = [];
    for (let i = 0; i <= source.length - oldLines.length; i += 1) if (this.same(source.slice(i, i + oldLines.length), oldLines)) candidates.push(i);
    if (candidates.length === 0) throw new Error(`Patch context not found in ${path} near old line ${hunk.oldStart}`);
    const ranked = candidates.map((index) => ({ index, distance: Math.abs(index - expected) })).sort((a, b) => a.distance - b.distance || a.index - b.index);
    if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) throw new Error(`Patch context is ambiguous in ${path}`);
    return ranked[0].index;
  }

  private oldLines(hunk: UnifiedDiffHunk): string[] {
    return hunk.lines.filter((line) => line.type === 'context' || line.type === 'remove').map((line) => line.text);
  }

  private same(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((line, index) => line === right[index]);
  }
}
