import { describe, expect, it } from 'vitest';
import { EditApplicatorPatch } from '@engine/Process/Edit/Applicator/EditApplicatorPatch.js';
import type { UnifiedDiffHunk } from '@model/Response/Format/DiffResponseFormatHandler.js';

describe('EditApplicatorPatch', () => {
  it('treats trailing empty EOF context as the file terminator', () => {
    const source = [
      "test('rejects blank titles', () => {",
      "  assert.throws(() => service.create('   '), /Todo title is required/);",
      '});',
      '',
    ].join('\r\n');
    const hunk: UnifiedDiffHunk = {
      oldStart: 2,
      oldCount: 3,
      newStart: 2,
      newCount: 5,
      lines: [
        { type: 'context', text: "  assert.throws(() => service.create('   '), /Todo title is required/);" },
        { type: 'context', text: '});' },
        { type: 'context', text: '' },
        { type: 'add', text: "test('deletes an existing todo', () => {" },
        { type: 'add', text: '  assert.equal(1, 1);' },
        { type: 'add', text: '});' },
      ],
    };

    const result = new EditApplicatorPatch().apply(source, [hunk], 'test/TodoService.test.ts');

    expect(result).toBe([
      "test('rejects blank titles', () => {",
      "  assert.throws(() => service.create('   '), /Todo title is required/);",
      '});',
      "test('deletes an existing todo', () => {",
      '  assert.equal(1, 1);',
      '});',
      '',
    ].join('\r\n'));
  });
});
