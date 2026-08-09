import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeExecutor(): PlanExecutor {
  return new PlanExecutor(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assessToolEvidence: async () => { throw new Error('search must not call semantic evidence evaluator'); } } as never,
    {} as never,
    { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
    {
      factsMerged() {},
      stepResult() {},
      planAdvance() {},
    } as never,
  );
}

function makeState(data: unknown): { state: PlanExecutionState; plan: TaskPlan } {
  const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'find CLI files' });
  const conversation = new Conversation('test-project', 'test-conversation');
  const execution = new Execution(task.id);
  execution.status = 'running';
  execution.setToolContext([{
    call: { tool: 'search', input: { query: 'CLI command', path: 'src' } },
    result: { ok: true, data },
  }], 1);
  const plan: TaskPlan = {
    version: 2,
    goal: 'find CLI files',
    steps: [{
      id: 'step-1',
      type: 'search',
      action: 'find-files',
      subject: 'files related to CLI commands',
      goal: 'Find files: files related to CLI commands',
      status: 'running',
      maxAttempts: 3,
      inputs: [],
      outputs: ['cli.files'],
    }],
  };
  return {
    plan,
    state: {
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
    },
  };
}

const executor = makeExecutor();
const success = makeState([{ path: 'src/cli/Cli.ts', line: 10, text: 'const COMMANDS = []' }]);
const completed = (executor as unknown as {
  completeSearchToolRound(state: PlanExecutionState, step: TaskPlan['steps'][number]): boolean;
}).completeSearchToolRound(success.state, success.plan.steps[0]);

assert(completed, 'find-files should complete as soon as a concrete file result exists');
assert(success.state.executionContext.has('cli.files'), 'search output fact must be published deterministically');
assert(success.plan.steps[0].status === 'completed', 'search step must be marked completed');
assert(success.state.planIndex === 1, 'executor must advance after deterministic search success');

const empty = makeState([]);
const emptyCompleted = (executor as unknown as {
  completeSearchToolRound(state: PlanExecutionState, step: TaskPlan['steps'][number]): boolean;
}).completeSearchToolRound(empty.state, empty.plan.steps[0]);
assert(!emptyCompleted, 'empty search results must not complete the step');
assert(!empty.state.executionContext.has('cli.files'), 'empty search must not publish output facts');

console.log('## Deterministic search completion smoke test');
console.log('concrete retrieval result completes search without evaluator: OK');
console.log('empty retrieval result remains retryable: OK');
console.log('PASS: search returns what it found; semantic sufficiency is not judged inside search.');
