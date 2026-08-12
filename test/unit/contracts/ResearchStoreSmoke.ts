import assert from 'node:assert/strict';
import { ResearchStore } from '@research/Store/ResearchStore';

const store = new ResearchStore();
store.putFact({
  key: 'project.cli.command-pattern',
  value: 'COMMANDS + if dispatch + continue',
  sources: ['src/cli/Cli.ts'],
  confidence: 1,
});

assert.equal(store.getFact('project.cli.command-pattern')?.value, 'COMMANDS + if dispatch + continue');
assert.deepEqual(store.invalidateBySource('src/cli/Cli.ts'), ['project.cli.command-pattern']);
assert.equal(store.getFact('project.cli.command-pattern'), undefined);

console.log('## research store');
console.log('fact cache hit: OK');
console.log('source invalidation: OK');
console.log('PASS');
