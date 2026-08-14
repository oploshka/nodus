export interface RangeReplaceOperation {
  /** Approximate 1-based inclusive start line. */
  startLine: number;
  /** Approximate 1-based inclusive end line. */
  endLine: number;
  /** Exact current text for only the small range being changed. */
  expected: string;
  /** Complete replacement text for that range. Empty string deletes it. */
  replacement: string;
}

/**
 * Small-range replacement strategy.
 *
 * The model only repeats the exact text of the small changed range instead of a
 * large surrounding block. Line numbers are hints; `expected` is the guard.
 * All operations are resolved against one snapshot and applied bottom-up.
 */
export class RangeReplaceApplicator {
  public apply(content: string, operations: RangeReplaceOperation[], path: string): string {
    if (operations.length === 0) return content;

    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const normalized = content.replace(/\r\n/g, '\n');
    const trailing = normalized.endsWith('\n');
    const source = normalized.split('\n');
    if (trailing) source.pop();

    const resolved = operations.map((operation) => {
      const expected = this.lines(operation.expected);
      const replacement = this.lines(operation.replacement);
      if (expected.length === 0 || (expected.length === 1 && expected[0] === '')) {
        throw new Error(`Range replace expected text is empty in ${path}`);
      }
      const start = Math.max(0, Math.round(operation.startLine) - 1);
      const end = Math.max(start, Math.round(operation.endLine) - 1);
      const hintedLength = end - start + 1;
      const index = this.resolve(source, expected, start, hintedLength, path, operation.startLine);
      return { operation, expected, replacement, index };
    });

    resolved.sort((a, b) => b.index - a.index);
    for (let i = 1; i < resolved.length; i += 1) {
      const lower = resolved[i - 1];
      const upper = resolved[i];
      if (upper.index + upper.expected.length > lower.index) throw new Error(`Range replace operations overlap in ${path}`);
    }

    const result = [...source];
    for (const item of resolved) {
      if (!this.same(result.slice(item.index, item.index + item.expected.length), item.expected)) {
        throw new Error(`Range replace context changed in ${path}`);
      }
      result.splice(item.index, item.expected.length, ...item.replacement);
    }

    const output = result.join('\n') + (trailing ? '\n' : '');
    return eol === '\r\n' ? output.replace(/\n/g, '\r\n') : output;
  }

  private resolve(
    source: string[],
    expected: string[],
    hintedStart: number,
    hintedLength: number,
    path: string,
    lineHint: number,
  ): number {
    // Exact hinted range is preferred, but the text guard remains authoritative.
    if (hintedLength === expected.length && this.same(source.slice(hintedStart, hintedStart + expected.length), expected)) {
      return hintedStart;
    }

    // If line count drifted, first search a small window around the hint.
    const radius = 12;
    const local: number[] = [];
    const from = Math.max(0, hintedStart - radius);
    const to = Math.min(source.length - expected.length, hintedStart + radius);
    for (let index = from; index <= to; index += 1) {
      if (this.same(source.slice(index, index + expected.length), expected)) local.push(index);
    }
    if (local.length === 1) return local[0];
    if (local.length > 1) throw new Error(`Range replace context is ambiguous in ${path} near line ${lineHint}`);

    const global: number[] = [];
    for (let index = 0; index <= source.length - expected.length; index += 1) {
      if (this.same(source.slice(index, index + expected.length), expected)) global.push(index);
    }
    if (global.length === 1) return global[0];
    if (global.length === 0) throw new Error(`Range replace context not found in ${path} near line ${lineHint}`);
    throw new Error(`Range replace context is ambiguous in ${path} near line ${lineHint}`);
  }

  private lines(value: string): string[] {
    const normalized = value.replace(/\r\n/g, '\n');
    const trailing = normalized.endsWith('\n');
    const lines = normalized.split('\n');
    if (trailing) lines.pop();
    return lines;
  }

  private same(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((line, index) => line === right[index]);
  }
}
