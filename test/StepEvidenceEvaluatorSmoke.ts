// StepEvidenceEvaluatorSmoke.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'understand CLI registration structure' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
execution.setToolContext([{
  call: { tool: 'file-system', input: { action: 'read', path: 'src/cli/Cli.ts' } },
  result: { ok: true, data: `const COMMANDS = [{ name: '/help' }];\nexport async function runCli() {}` },
}], 1);

const plan: TaskPlan = {
  version: 1,
  goal: 'understand CLI structure',
  steps: [{
    id: 'step-1',
    type: 'understand',
    action: 'identify-pattern',
    subject: 'CLI command registration',
    goal: 'Identify CLI command registration',
    status: 'running',
    maxAttempts: 2,
    inputs: [],
    outputs: ['cli.structure'],
  }],
};

let evaluatorCalls = 0;
const executor = new PlanExecutor(
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  { assessToolEvidence: async () => { evaluatorCalls += 1; throw new Error('must not run'); } } as never,
  {} as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {} as never,
);

const state: PlanExecutionState = {
  task,
  conversation,
  execution,
  plan,
  planIndex: 0,
  stepAttempts: 1,
  recoveryAttempts: new Map(),
  stepResults: new Map([['step-1', {
    goalSatisfied: false,
    findings: [],
    evidence: [],
    missing: ['src/cli/Cli.ts source'],
    facts: [],
  }]]),
  executionContext: new ExecutionContext(),
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  resumes: 0,
  startedAt: Date.now(),
};

(executor as unknown as {
  recordUnderstandToolRound(state: PlanExecutionState, step: TaskPlan['steps'][number]): void;
}).recordUnderstandToolRound(state, plan.steps[0]);

const recorded = state.stepResults.get('step-1');
assert(recorded, 'understand tool round should be recorded');
assert(recorded.evidence.some((item) => item.path === 'src/cli/Cli.ts'), 'source path should survive as compact evidence');
assert(recorded.missing.length === 0, 'successful requested read should clear the stale transient missing request');
assert(evaluatorCalls === 0, 'recording a tool round must not call an evaluator model');
assert(execution.getToolContext().length === 1, 'raw source must remain available for the immediate next understand call');
assert(plan.steps[0].status === 'running', 'tool evidence alone must not complete understand');

console.log('## Understand tool-round smoke test');
console.log('requested source recorded as compact evidence: OK');
console.log('raw source kept for immediate next model call: OK');
console.log('no evaluator model called: OK');
console.log('PASS: understand tool rounds are transport, not a second semantic operation.');
