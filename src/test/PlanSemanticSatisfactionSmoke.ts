// PlanSemanticSatisfactionSmoke.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'test deterministic recovery pruning' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';

const plan: TaskPlan = {
  version: 1,
  goal: 'prune redundant recovery search',
  steps: [
    {
      id: 'recovery-extra',
      type: 'search',
      goal: 'Find another command example',
      status: 'pending',
      maxAttempts: 1,
      inputs: [],
      outputs: ['cli.commandExample.extra'],
      recoveryForStepId: 'parent-search',
    },
    {
      id: 'parent-search',
      type: 'search',
      goal: 'Find the command example required to add a CLI command',
      status: 'pending',
      maxAttempts: 1,
      inputs: [],
      outputs: ['cli.commandExample'],
    },
  ],
};

const executionContext = new ExecutionContext();
executionContext.mergeStepResult({
  id: 'recovery-result',
  type: 'search',
  goal: 'Find CLI command example',
  status: 'completed',
  maxAttempts: 1,
  inputs: [],
  outputs: ['cli.commandExample'],
}, {
  goalSatisfied: true,
  findings: ['Existing command example located.'],
  evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'COMMANDS item + inline handler.' }],
  missing: [],
  facts: [{ key: 'cli.commandExample', value: 'COMMANDS item + inline handler in runCli.', evidence: [] }],
});

let satisfactionCalls = 0;
const reporterEvents: string[] = [];
const executor = new PlanExecutor(
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {
    assessStepSatisfaction: async () => {
      satisfactionCalls += 1;
      throw new Error('recovery pruning must not call semantic satisfaction');
    },
  } as never,
  {} as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {
    recoveryPruned(_goal: string, count: number) { reporterEvents.push(`pruned:${count}`); },
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
  resumes: 0,
  startedAt: Date.now(),
};

const pruned = await (executor as unknown as {
  tryPruneRecoveryBranch(state: PlanExecutionState, parentStepId: string): Promise<boolean>;
}).tryPruneRecoveryBranch(state, 'parent-search');

assert(pruned, 'recovery branch should be pruned when the exact parent output already exists');
assert(satisfactionCalls === 0, `semantic satisfaction must not run, got ${satisfactionCalls}`);
assert(plan.steps[0].status === 'completed', 'redundant recovery sibling should be marked completed');
assert(reporterEvents.includes('pruned:1'), 'recovery pruning should be reported');

console.log('## Deterministic recovery pruning smoke test');
console.log('exact parent output detected without model call: OK');
console.log('redundant recovery sibling pruned: OK');
console.log('semantic satisfaction evaluator not used: OK');
console.log('PASS: recovery pruning follows exact postconditions instead of semantic reinterpretation.');
