// UnderstandDerivationSmoke.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'derive CLI understanding' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';

const plan: TaskPlan = {
  version: 1,
  goal: 'understand CLI integration',
  steps: [{
    id: 'step-understand',
    type: 'understand',
    goal: 'Understand how CLI registration and project data fit together',
    status: 'pending',
    maxAttempts: 2,
    inputs: ['cli.structure', 'project.id.source'],
    outputs: ['cli.integration'],
  }],
};

const executionContext = new ExecutionContext();
executionContext.mergeStepResult({
  id: 'search-cli',
  type: 'search',
  goal: 'find CLI',
  status: 'completed',
  maxAttempts: 1,
  inputs: [],
  outputs: ['cli.structure'],
}, {
  goalSatisfied: true,
  findings: ['Commands are declared in COMMANDS and handled in runCli.'],
  evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'Command dispatch is implemented with if branches.' }],
  missing: [],
  facts: [{ key: 'cli.structure', value: 'COMMANDS + runCli if handlers', evidence: [] }],
});
executionContext.mergeStepResult({
  id: 'search-project',
  type: 'search',
  goal: 'find project id',
  status: 'completed',
  maxAttempts: 1,
  inputs: [],
  outputs: ['project.id.source'],
}, {
  goalSatisfied: true,
  findings: ['Project id is configuration.project.id.'],
  evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'configuration.project.id is already used.' }],
  missing: [],
  facts: [{ key: 'project.id.source', value: 'configuration.project.id', evidence: [] }],
});

let semanticCalls = 0;
let normalCalls = 0;
const executor = new PlanExecutor(
  {} as never,
  { execute: async () => { normalCalls += 1; throw new Error('normal understand call should be skipped'); } } as never,
  {} as never,
  {} as never,
  {} as never,
  {
    assessStepSatisfaction: async () => {
      semanticCalls += 1;
      return {
        satisfied: true,
        reason: 'Existing input facts are enough to derive the integration pattern.',
        missing: [],
        facts: [{ key: 'cli.integration', value: 'Add COMMANDS entry and read project id from configuration.project.id inside runCli.' }],
      };
    },
  } as never,
  {} as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {
    semanticCheck() {},
    semanticCheckResult() {},
    factsMerged() {},
    planAdvance() {},
    recoveryDecision() {},
    paused() {},
  } as never,
);

const state: PlanExecutionState = {
  task,
  conversation,
  execution,
  plan,
  planIndex: 0,
  stepAttempts: 0,
  recoveryAttempts: new Map(),
  stepResults: new Map(),
  executionContext,
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  stepProgress: new Map(),
  resumes: 0,
  startedAt: Date.now(),
};

const result = await executor.run(state);
assert(result === 'finished', 'plan should finish after semantic derivation');
assert(semanticCalls === 1, `expected one semantic derivation call, got ${semanticCalls}`);
assert(normalCalls === 0, 'full understand operation must not run when inputs already satisfy the goal');
assert(executionContext.has('cli.integration'), 'derived understand output should be stored');
assert(plan.steps[0].status === 'completed', 'understand step should be completed');

// No-progress retry guard.
const blockedPlan: TaskPlan = {
  version: 1,
  goal: 'guard repeated understand retry',
  steps: [{
    id: 'blocked-understand',
    type: 'understand',
    goal: 'Understand a missing relation',
    status: 'running',
    maxAttempts: 2,
    inputs: [],
    outputs: ['missing.relation'],
  }],
};
const blockedExecution = new Execution(task.id);
blockedExecution.status = 'running';
const repeatedResult = {
  goalSatisfied: false,
  findings: ['Same partial understanding.'],
  evidence: [{ path: 'src/example.ts', fact: 'Same evidence.' }],
  missing: ['Need one concrete relation.'],
  facts: [],
};
const blockedState: PlanExecutionState = {
  ...state,
  execution: blockedExecution,
  plan: blockedPlan,
  planIndex: 0,
  stepAttempts: 2,
  stepResults: new Map([['blocked-understand', repeatedResult]]),
  executionContext: new ExecutionContext(),
  recoveryAttempts: new Map(),
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  stepProgress: new Map(),
  pauseReason: undefined,
};
const internals = executor as unknown as {
  recordStepProgress(state: PlanExecutionState, stepId: string, result: typeof repeatedResult): void;
  applyRecovery(state: PlanExecutionState, decision: { action: string; reason: string; steps: never[] }): boolean;
};
internals.recordStepProgress(blockedState, 'blocked-understand', repeatedResult);
internals.recordStepProgress(blockedState, 'blocked-understand', repeatedResult);
const retryApplied = internals.applyRecovery(blockedState, { action: 'retry-current', reason: 'try the same thing again', steps: [] });
assert(!retryApplied, 'unchanged repeated understand work must not be retried');
assert((blockedExecution.status as string) === 'paused', 'no-progress retry should pause instead of looping');

console.log('## Understand derivation smoke test');
console.log('known input facts satisfy understand before full operation: OK');
console.log('derived output stored under exact postcondition key: OK');
console.log('unchanged retry-current blocked: OK');
console.log('PASS: understand derives from facts and stops repeated no-progress loops.');
