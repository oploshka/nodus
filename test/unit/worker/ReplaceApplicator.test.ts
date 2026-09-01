import { describe, expect, it } from 'vitest';
import { ReplaceApplicator } from '@engine/Edit/Applicator/EditApplicatorReplace.js';

describe('EditApplicatorReplace', () => {
  it('uses line as a hint and validates the exact before block', () => {
    const source = ['one', 'two', 'three', 'four', ''].join('\n');
    const result = new ReplaceApplicator().apply(source, [{
      line: 2,
      before: 'three',
      after: 'THREE',
    }], 'file.ts');
    expect(result).toBe(['one', 'two', 'THREE', 'four', ''].join('\n'));
  });

  it('applies multiple replacements bottom-up against one source snapshot', () => {
    const source = ['a', 'b', 'c', 'd', ''].join('\n');
    const result = new ReplaceApplicator().apply(source, [
      { line: 2, before: 'b', after: ['b1', 'b2'].join('\n') },
      { line: 4, before: 'd', after: 'D' },
    ], 'file.ts');
    expect(result).toBe(['a', 'b1', 'b2', 'c', 'D', ''].join('\n'));
  });

  it('rejects missing or ambiguous before blocks instead of guessing', () => {
    const applicator = new ReplaceApplicator();
    expect(() => applicator.apply('a\nx\na\n', [{ line: 2, before: 'a', after: 'A' }], 'file.ts'))
      .toThrow('ambiguous');
    expect(() => applicator.apply('a\nb\n', [{ line: 1, before: 'x', after: 'X' }], 'file.ts'))
      .toThrow('not found');
  });
});
