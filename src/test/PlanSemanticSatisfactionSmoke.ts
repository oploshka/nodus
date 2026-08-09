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

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'test semantic satisfaction' });
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
      goal: 'Find examples or the registration pattern required to add a CLI command',
      status: 'pending',
      maxAttempts: 1,
      inputs: ['cli.commandRegistrationPattern'],
      outputs: ['cli.commandExample'],
    },
  ],
};

const executionContext = new ExecutionContext();
executionContext.mergeStepResult({
  id: 'recovery-analysis',
  type: 'understand',
  goal: 'Analyze Cli.ts',
  status: 'completed',
  maxAttempts: 1,
  inputs: [],
  outputs: ['cli.commandRegistrationPattern'],
}, {
  goalSatisfied: true,
  findings: ['Commands are added to COMMANDS and handled by if branches in runCli.'],
  evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'Existing commands use direct if handlers.' }],
  missing: [],
  facts: [{ key: 'cli.commandRegistrationPattern', value: 'Add an item to COMMANDS and an if handler in runCli.', evidence: [] }],
});

let satisfactionCalls = 0;
const reporterEvents: string[] = [];
const executor = new PlanExecutor(
  {} as never,
  { execute: async () => { throw new Error('normal model call must not run'); } } as never,
  {} as never,
  {} as never,
  {} as never,
  {
    assessStepSatisfaction: async () => {
      satisfactionCalls += 1;
      return {
        satisfied: true,
        reason: 'Existing registration pattern already supplies the requested example.',
        missing: [],
        facts: [{ key: 'cli.commandExample', value: 'COMMANDS item + if branch in runCli.' }],
      };
    },
  } as never,
  { insertBefore() {}, markPendingFrom() {} } as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {
    semanticCheck() {},
    semanticCheckResult() {},
    factsMerged(keys: string[]) { reporterEvents.push(`facts:${keys.join(',')}`); },
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

assert(pruned, 'recovery branch should be pruned when known facts satisfy parent goal');
assert(satisfactionCalls === 1, `expected one small semantic check, got ${satisfactionCalls}`);
assert(plan.steps[0].status === 'completed', 'redundant recovery sibling should be marked completed');
assert(executionContext.has('cli.commandExample'), 'semantic check must publish the exact parent output');
assert(reporterEvents.includes('pruned:1'), 'recovery pruning should be reported');

console.log('## Plan semantic satisfaction smoke test');
console.log('semantic gate derives exact parent output: OK');
console.log('redundant recovery sibling pruned: OK');
console.log('normal operation model call avoided: OK');
console.log('PASS: recovery branches are re-evaluated against accumulated facts.');
