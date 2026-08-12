import assert from 'node:assert/strict';
import { ChangeExecution } from '@execution/ChangeExecution';
import type { ChangeExecutionContext } from '@execution/ChangeExecutionContext';
import { ChangeOptionResolver } from '@execution/Option/ChangeOption';
import type { ChangeState } from '@execution/State/ChangeState';
import type { Worker } from '@execution/Worker/Worker';

const context = {} as ChangeExecutionContext;

const propose: Worker<ChangeState, ChangeExecutionContext> = {
  id: 'edit-proposal',
  async execute(state) {
    return {
      ...state,
      phase: 'proposed',
      proposal: [{ type: 'write', path: state.work.targetPath, content: `attempt:${state.attempt}` }],
    };
  },
};

const prepare: Worker<ChangeState, ChangeExecutionContext> = {
  id: 'change-prepare',
  async execute(state) {
    if (state.attempt === 1) throw new Error('first candidate rejected');
    const change = state.proposal![0];
    return {
      ...state,
      phase: 'prepared',
      prepared: [{ change, path: change.path, resultingContent: change.type === 'write' ? change.content : '' }],
    };
  },
};

const validate: Worker<ChangeState, ChangeExecutionContext> = {
  id: 'change-validation',
  async execute(state) {
    return { ...state, phase: 'validated' };
  },
};

const commit: Worker<ChangeState, ChangeExecutionContext> = {
  id: 'change-commit',
  async execute(state) {
    return { ...state, phase: 'completed' };
  },
};

const execution = new ChangeExecution(new ChangeOptionResolver(), [propose, prepare, validate, commit]);
const result = await execution.execute({
  work: {
    id: 'edit:1',
    goal: 'change one file',
    targetPath: 'src/example.ts',
    inputs: [],
    outputs: ['change-result:example'],
    maxAttempts: 3,
  },
  facts: [],
  context,
});

assert.equal(result.status, 'completed');
assert.equal(result.state.phase, 'completed');
assert.equal(result.state.attempt, 2);
assert.equal(result.state.proposal?.[0]?.type, 'write');
assert.deepEqual(
  result.state.history.map((event) => `${event.option}:${event.ok ? 'ok' : 'failed'}`),
  [
    'propose-change:ok',
    'prepare-candidate:failed',
    'propose-change:ok',
    'prepare-candidate:ok',
    'validate-candidate:ok',
    'commit-candidate:ok',
  ],
);

console.log('## execution State/Option/Worker');
console.log('retry stays inside execution runtime: OK');
console.log('state records option/worker history: OK');
console.log('PASS');
