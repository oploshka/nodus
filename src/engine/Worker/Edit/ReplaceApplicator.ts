export interface ReplaceOperation {
  /** 1-based location hint. The actual replacement is validated by `before`. */
  line: number;
  before: string;
  after: string;
}

/**
 * Deterministic text replacement for model-generated edits.
 *
 * `line` is only a location hint. `before` is the authoritative guard: the
 * applicator locates that exact block, resolves all operations against the same
 * source snapshot, then applies them from bottom to top so earlier edits cannot
 * shift later locations.
 */
export class ReplaceApplicator {
  public apply(content: string, operations: ReplaceOperation[], path: string): string {
    if (operations.length === 0) return content;

    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const normalized = content.replace(/\r\n/g, '\n');
    const hadTrailingNewline = normalized.endsWith('\n');
    const source = normalized.split('\n');
    if (hadTrailingNewline) source.pop();

    const resolved = operations.map((operation) => {
      const before = this.lines(operation.before);
      const after = this.lines(operation.after);
      if (before.length === 0 || (before.length === 1 && before[0] === '')) {
        throw new Error(`Replace before block is empty in ${path}`);
      }
      return { operation, before, after, index: this.resolve(source, before, operation.line, path) };
    });

    resolved.sort((a, b) => b.index - a.index);
    for (let i = 1; i < resolved.length; i += 1) {
      const lower = resolved[i - 1];
      const upper = resolved[i];
      if (upper.index + upper.before.length > lower.index) {
        throw new Error(`Replace operations overlap in ${path}`);
      }
    }

    const result = [...source];
    for (const item of resolved) {
      if (!this.same(result.slice(item.index, item.index + item.before.length), item.before)) {
        throw new Error(`Replace context changed in ${path}`);
      }
      result.splice(item.index, item.before.length, ...item.after);
    }

    const output = result.join('\n') + (hadTrailingNewline ? '\n' : '');
    return eol === '\r\n' ? output.replace(/\n/g, '\r\n') : output;
  }

  private resolve(source: string[], before: string[], lineHint: number, path: string): number {
    const expected = Math.max(0, Math.round(lineHint) - 1);
    if (this.same(source.slice(expected, expected + before.length), before)) return expected;

    const candidates: number[] = [];
    for (let index = 0; index <= source.length - before.length; index += 1) {
      if (this.same(source.slice(index, index + before.length), before)) candidates.push(index);
    }
    if (candidates.length === 0) {
      throw new Error(`Replace context not found in ${path} near line ${lineHint}`);
    }

    const ranked = candidates
      .map((index) => ({ index, distance: Math.abs(index - expected) }))
      .sort((left, right) => left.distance - right.distance || left.index - right.index);
    if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) {
      throw new Error(`Replace context is ambiguous in ${path} near line ${lineHint}`);
    }
    return ranked[0].index;
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
