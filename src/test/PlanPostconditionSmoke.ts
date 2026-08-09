import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'test' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';

const plan: TaskPlan = {
  version: 1,
  goal: 'test postconditions',
  steps: [{
    id: 'recovery-parent',
    type: 'search',
    goal: 'Find CLI registration',
    status: 'pending',
    maxAttempts: 1,
    inputs: ['cli.registration'],
    outputs: ['cli.registration'],
  }],
};

const executionContext = new ExecutionContext();
executionContext.mergeStepResult({
  id: 'recovery-child',
  type: 'understand',
  goal: 'Read Cli.ts',
  status: 'completed',
  maxAttempts: 1,
  inputs: [],
  outputs: ['cli.registration'],
}, {
  goalSatisfied: true,
  findings: ['CLI registration is implemented in COMMANDS and runCli.'],
  evidence: [{ path: 'src/cli/Cli.ts', symbol: 'COMMANDS', fact: 'Commands are declared here.' }],
  missing: [],
  facts: [{ key: 'cli.registration', value: 'COMMANDS + runCli', evidence: [] }],
});

let modelCalls = 0;
const reporterEvents: string[] = [];
const executor = new PlanExecutor(
  { get: () => ({}) } as never,
  { execute: async () => { modelCalls += 1; throw new Error('model must not be called'); } } as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  { insertBefore() {}, markPendingFrom() {} } as never,
  { info: async () => {}, error: async () => {} } as never,
  {
    planStep() {},
    stepAlreadySatisfied(keys: string[]) { reporterEvents.push(keys.join(',')); },
    planAdvance() {},
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

await executor.run(state);
assert(modelCalls === 0, `expected 0 model calls, got ${modelCalls}`);
assert(plan.steps[0].status === 'completed', 'step with satisfied outputs must be completed');
assert(reporterEvents[0] === 'cli.registration', 'skip must be reported with satisfied output');
assert(execution.currentStep === 0, 'skipped postcondition must not consume a model step');

const recoveryPlan: TaskPlan = {
  version: 1,
  goal: 'recovery wiring',
  steps: [{
    id: 'recovery-1',
    type: 'search',
    goal: 'Find registration',
    status: 'pending',
    maxAttempts: 1,
    inputs: [],
    outputs: ['cli.registration'],
  }],
};
const recoveryState = { ...state, plan: recoveryPlan, planIndex: 0, executionContext: new ExecutionContext(), recoveryGoals: new Set<string>() };
const recoveryStep = {
  id: 'recovery-1',
  type: 'understand' as const,
  goal: 'Read Cli.ts',
  status: 'pending' as const,
  maxAttempts: 1,
  inputs: [],
  outputs: ['cli.registration'],
};

const recoveryExecutor = new PlanExecutor(
  {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
  {
    insertBefore(target: TaskPlan, index: number, steps: typeof target.steps) { target.steps.splice(index, 0, ...steps); },
    markPendingFrom() {},
  } as never,
  {} as never,
  { recoveryDecision() {}, planUpdated() {}, paused() {} } as never,
);

const applied = (recoveryExecutor as unknown as { applyRecovery(state: PlanExecutionState, decision: unknown): boolean }).applyRecovery(recoveryState, {
  action: 'insert-steps',
  reason: 'need evidence',
  steps: [recoveryStep],
});
assert(applied, 'recovery insertion should succeed');
const parent = recoveryPlan.steps.find((step) => step.goal === 'Find registration');
const child = recoveryPlan.steps.find((step) => step.goal === 'Read Cli.ts');
assert(parent !== undefined && !parent.inputs.includes('cli.registration'), 'recovery output equal to parent output must not become parent input');
assert(child !== undefined && child.id !== parent?.id, 'recovery step id must be made unique');

console.log('## Plan postcondition smoke test');
console.log('pre-satisfied output skips model call: OK');
console.log('skip does not consume model attempt: OK');
console.log('recovery output does not create self-dependency: OK');
console.log('recovery step IDs are unique: OK');
console.log('PASS: outputs behave as postconditions.');
