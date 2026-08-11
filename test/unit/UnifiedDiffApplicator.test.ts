import assert from 'node:assert/strict';
import test from 'node:test';
import { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import type { UnifiedDiffHunk, UnifiedDiffLine } from '@core/Change/ChangeSet';
import { EditFileRawProtocol } from '@model/Protocol/EditFileRawProtocol';

const executor = new ChangeExecutor({} as never, {} as never, {} as never);
const apply = (source: string, hunks: UnifiedDiffHunk[], path = 'file.ts'): string => (
  executor as unknown as { applyUnifiedDiff(content: string, hunks: UnifiedDiffHunk[], path: string): string }
).applyUnifiedDiff(source, hunks, path);

const line = (type: UnifiedDiffLine['type'], text: string): UnifiedDiffLine => ({ type, text } as UnifiedDiffLine);
const hunk = (oldStart: number, lines: UnifiedDiffLine[]): UnifiedDiffHunk => ({
  oldStart,
  oldCount: lines.filter((item) => item.type !== 'add').length,
  newStart: oldStart,
  newCount: lines.filter((item) => item.type !== 'remove').length,
  lines,
});

test('applies an insertion-only hunk using unchanged context', () => {
  const result = apply('alpha\nbeta\n', [hunk(2, [line('context', 'beta'), line('add', 'inserted')])]);
  assert.equal(result, 'alpha\nbeta\ninserted\n');
});

test('applies a replacement hunk', () => {
  const result = apply('alpha\nbeta\ngamma\n', [hunk(2, [line('remove', 'beta'), line('add', 'BETA')])]);
  assert.equal(result, 'alpha\nBETA\ngamma\n');
});

test('applies multiple hunks bottom-up', () => {
  const result = apply('one\ntwo\nthree\nfour\n', [
    hunk(2, [line('context', 'two'), line('add', 'two-and-half')]),
    hunk(4, [line('remove', 'four'), line('add', 'FOUR')]),
  ]);
  assert.equal(result, 'one\ntwo\ntwo-and-half\nthree\nFOUR\n');
});

test('chooses the exact repeated context nearest oldStart', () => {
  const result = apply('same\nx\nsame\ny\nsame\n', [hunk(3, [line('context', 'same'), line('add', 'nearest')])]);
  assert.equal(result, 'same\nx\nsame\nnearest\ny\nsame\n');
});

test('rejects equally distant repeated context', () => {
  assert.throws(
    () => apply('same\nx\nsame\n', [hunk(2, [line('context', 'same'), line('add', 'ambiguous')])]),
    /ambiguous/,
  );
});

test('preserves CRLF when the unified diff uses LF', () => {
  const result = apply('alpha\r\nbeta\r\n', [hunk(2, [line('remove', 'beta'), line('add', 'BETA')])]);
  assert.equal(result, 'alpha\r\nBETA\r\n');
});

test('preserves a missing trailing newline and ignores the diff marker', () => {
  const parsed = new EditFileRawProtocol().parse(`STATUS completed
ACTION patch
PATH file.ts
DIFF
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new
\\ No newline at end of file`, 'file.ts');
  const change = parsed.changes[0];
  assert.ok(change?.type === 'patch');
  assert.equal(apply('old', change.hunks), 'new');
});

test('applies the corrected real /status patch with inaccurate hunk counts', () => {
  const parsed = new EditFileRawProtocol().parse(`STATUS completed
ACTION patch
PATH src/cli/Cli.ts
DIFF
--- a/src/cli/Cli.ts
+++ b/src/cli/Cli.ts
@@ -12,99 +12,1 @@
   { name: '/conversation', description: 'Show current conversation ID.' },
+  { name: '/status', description: 'Show project and conversation status.' },
   { name: '/new', description: 'Create a new conversation.' },
@@ -100,1 +101,99 @@
       if (value === '/conversation') {
         console.log(conversation.id);
         continue;
       }
+      if (value === '/status') {
+        console.log(\`Project ID: \${configuration.project.id}\`);
+        console.log(\`Conversation ID: \${conversation.id}\`);
+        console.log(\`Indexed files: \${nodus.projectSession.index?.files.length || 0}\`);
+        continue;
+      }
       if (value === '/new') {`, 'src/cli/Cli.ts');
  const change = parsed.changes[0];
  assert.ok(change?.type === 'patch');
  const source = `  { name: '/conversation', description: 'Show current conversation ID.' },
  { name: '/new', description: 'Create a new conversation.' },
      if (value === '/conversation') {
        console.log(conversation.id);
        continue;
      }
      if (value === '/new') {`;
  const result = apply(source, change.hunks, 'src/cli/Cli.ts');
  assert.match(result, /value === '\/status'/);
  assert.match(result, /projectSession\.index\?\.files\.length/);
});

test('rejects the inconsistent real model hunk instead of guessing', () => {
  const malformed = hunk(4, [
    line('context', "      if (value === '/conversation') {"),
    line('context', '        console.log(conversation.id);'),
    line('context', '        continue;'),
    line('add', '      }'),
    line('add', "      if (value === '/status') {"),
    line('context', '        continue;'),
    line('context', '      }'),
    line('context', "      if (value === '/new') {"),
  ]);
  const source = `      if (value === '/conversation') {
        console.log(conversation.id);
        continue;
      }
      if (value === '/new') {`;
  assert.throws(
    () => apply(source, [malformed], 'src/cli/Cli.ts'),
    (error: unknown) => error instanceof Error
      && /could not match context near old line 4/.test(error.message)
      && error.message.includes('Rejected old-side sequence')
      && error.message.includes('Authoritative source near the hint'),
  );
});
