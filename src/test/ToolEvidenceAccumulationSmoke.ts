import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'locate project identity sources' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
const plan: TaskPlan = {
  version: 1,
  goal: 'locate identity sources',
  steps: [{
    id: 'step-1',
    type: 'search',
    goal: 'Find project ID, conversation ID, and project index sources',
    status: 'running',
    maxAttempts: 3,
    inputs: [],
    outputs: ['project.id.source', 'conversation.id.source', 'index.files.count.source'],
  }],
};

const evaluatorAccumulatedCounts: number[] = [];
const executor = new PlanExecutor(
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {
    assessToolEvidence: async (input: { accumulated?: { evidence: unknown[] } }) => {
      evaluatorAccumulatedCounts.push(input.accumulated?.evidence.length ?? 0);
      return {
        satisfied: false,
        reason: 'Need one more source.',
        missing: ['ProjectIndex access source'],
        findings: [],
        evidence: [], // deliberately empty: runtime evidence must survive this
        facts: [],
      };
    },
  } as never,
  {} as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {
    evidenceCheck() {}, evidenceCheckResult() {}, factsMerged() {}, stepResult() {}, planAdvance() {},
  } as never,
);

const state: PlanExecutionState = {
  task,
  conversation,
  execution,
  plan,
  planIndex: 0,
  stepAttempts: 1,
  recoveryAttempts: new Map(),
  stepResults: new Map(),
  executionContext: new ExecutionContext(),
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  resumes: 0,
  startedAt: Date.now(),
};

execution.setToolContext([
  {
    call: { tool: 'search', input: { query: 'projectId' } },
    result: { ok: true, data: [{ path: 'src/core/Task/Task.ts', line: 12, text: 'public readonly projectId: string;' }] },
  },
  {
    call: { tool: 'file-system', input: { action: 'read', path: 'src/cli/Cli.ts' } },
    result: { ok: true, data: 'console.log(configuration.project.id); console.log(conversation.id);' },
  },
], 1);

await (executor as unknown as {
  evaluateToolRound(state: PlanExecutionState, step: TaskPlan['steps'][number]): Promise<boolean>;
}).evaluateToolRound(state, plan.steps[0]);

const first = state.stepResults.get('step-1');
assert(first, 'step result should exist after first tool round');
assert(first.evidence.length >= 2, 'runtime should persist normalized tool evidence even when evaluator returns none');
assert(evaluatorAccumulatedCounts[0] >= 2, 'evaluator should receive normalized evidence from the current tool round');

execution.setToolContext([
  {
    call: { tool: 'search', input: { query: 'projectSession.index' } },
    result: { ok: true, data: [{ path: 'src/cli/Cli.ts', line: 50, text: 'nodus.projectSession.index.files.length' }] },
  },
], 1);

await (executor as unknown as {
  evaluateToolRound(state: PlanExecutionState, step: TaskPlan['steps'][number]): Promise<boolean>;
}).evaluateToolRound(state, plan.steps[0]);

const second = state.stepResults.get('step-1');
assert(second, 'step result should exist after second tool round');
assert(second.evidence.length > first.evidence.length, 'second tool round should extend accumulated evidence');
assert(evaluatorAccumulatedCounts[1] === second.evidence.length, 'evaluator should receive all accumulated evidence on the next round');

console.log('## Tool evidence accumulation smoke test');
console.log(`round 1 accumulated evidence: ${evaluatorAccumulatedCounts[0]}`);
console.log(`round 2 accumulated evidence: ${evaluatorAccumulatedCounts[1]}`);
console.log('unsatisfied evaluator cannot erase concrete tool evidence: OK');
console.log('PASS: tool results persist as normalized evidence across search attempts.');
