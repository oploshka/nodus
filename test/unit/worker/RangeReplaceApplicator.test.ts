import { describe, expect, it } from 'vitest';
import { RangeReplaceApplicator } from '@engine/Edit/Applicator/RangeReplaceApplicator.js';

describe('RangeReplaceApplicator', () => {
  it('uses a small exact range with line numbers only as hints', () => {
    const source = ['one', 'two', 'three', 'four', ''].join('\n');
    const result = new RangeReplaceApplicator().apply(source, [{
      startLine: 2,
      endLine: 2,
      expected: 'three',
      replacement: 'THREE',
    }], 'file.ts');
    expect(result).toBe(['one', 'two', 'THREE', 'four', ''].join('\n'));
  });

  it('applies multiple small ranges bottom-up against one source snapshot', () => {
    const source = ['a', 'b', 'c', 'd', ''].join('\n');
    const result = new RangeReplaceApplicator().apply(source, [
      { startLine: 2, endLine: 2, expected: 'b', replacement: ['b1', 'b2'].join('\n') },
      { startLine: 4, endLine: 4, expected: 'd', replacement: 'D' },
    ], 'file.ts');
    expect(result).toBe(['a', 'b1', 'b2', 'c', 'D', ''].join('\n'));
  });

  it('rejects ambiguous or missing guards instead of choosing a nearby match', () => {
    const applicator = new RangeReplaceApplicator();
    expect(() => applicator.apply('a\nx\na\n', [{ startLine: 2, endLine: 2, expected: 'a', replacement: 'A' }], 'file.ts'))
      .toThrow('ambiguous');
    expect(() => applicator.apply('a\nb\n', [{ startLine: 1, endLine: 1, expected: 'x', replacement: 'X' }], 'file.ts'))
      .toThrow('not found');
  });
});
