import assert from 'node:assert/strict';
import { PatchApplyWorker } from '@execution/Worker/PatchApplyWorker';

const worker = new PatchApplyWorker();
const source = [
  'const a = 1;',
  '',
  'function value() {',
  '  return a;',
  '}',
  '',
].join('\n');

const result = worker.apply(source, [{
  oldStart: 2,
  oldCount: 3,
  newStart: 2,
  newCount: 3,
  lines: [
    { type: 'context', text: 'function value() {' },
    { type: 'remove', text: '  return a;' },
    { type: 'add', text: '  return a + 1;' },
    { type: 'context', text: '}' },
  ],
}], 'src/example.ts');

assert.match(result, /return a \+ 1;/);
assert.match(result, /const a = 1;/);

console.log('## patch apply worker');
console.log('shifted hunk resolves against authoritative source: OK');
console.log('PASS');
