import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import { PlanUpdater } from '@agent/Planning/PlanUpdater';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';
import type { OperationResult } from '@model/Result/OperationResult';
import type { ModelExecutionInput } from '@model/Controller/ModelController';
import { activeStepMessage } from '@model/Prompt/ModelInputComposer';

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'Apply status patch.' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
const plan: TaskPlan = {
  version: 1,
  goal: 'apply status patch',
  steps: [{
    id: 'edit-status',
    type: 'edit-file',
    action: 'apply-change',
    subject: 'status command',
    goal: 'apply status command',
    status: 'pending',
    maxAttempts: 3,
    inputs: [],
    outputs: ['change-result:status.command'],
    targetPath: 'src/cli/Cli.ts',
  }],
};

let modelCalls = 0;
let applyCalls = 0;
const retryReasons: string[] = [];
const modelRetryReasons: Array<string | undefined> = [];
const result = (): OperationResult => ({
  status: 'completed',
  toolCalls: [],
  observations: [],
  changes: [{ type: 'write', path: 'src/cli/Cli.ts', content: '// corrected patch result\n' }],
});
const executor = new PlanExecutor(
  { get: (id: string) => ({ id }) } as never,
  { execute: async (input: ModelExecutionInput) => {
    modelCalls += 1;
    modelRetryReasons.push(input.activeStep?.retryReason);
    return result();
  } } as never,
  { execute: async () => ({ requested: 0, executed: 0, success: 0, failed: 0, useful: 0 }) } as never,
  {
    apply: async () => {
      applyCalls += 1;
      if (applyCalls === 1) throw new Error('Patch hunk for src/cli/Cli.ts could not match context near old line 100');
    },
  } as never,
  { ask: async () => 'stop' } as never,
  { recover: async () => { throw new Error('Retry budget should handle the first apply failure without recovery'); } } as never,
  new PlanUpdater(),
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  new Proxy({}, {
    get(_target, property) {
      if (property === 'planStep') return (_index: number, _count: number, _goal: string, _type: string, _attempt: number, _max: number, reason?: string) => {
        if (reason) retryReasons.push(reason);
      };
      return () => {};
    },
  }) as never,
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
  executionContext: new ExecutionContext(),
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  resumes: 0,
  startedAt: Date.now(),
};

await executor.run(state);
if (modelCalls !== 2 || applyCalls !== 2) throw new Error(`Expected one automatic retry, got model=${modelCalls}, apply=${applyCalls}`);
if (!retryReasons.some((reason) => reason.includes('could not match context near old line 100'))) {
  throw new Error('Apply failure was not supplied as the retry reason');
}
if (modelRetryReasons[0] !== undefined || !modelRetryReasons[1]?.includes('could not match context near old line 100')) {
  throw new Error('Apply failure was not supplied to the retry model request');
}
const retryMessage = activeStepMessage({ id: 'edit-status', type: 'edit-file', retryReason: modelRetryReasons[1] }).content;
if (!retryMessage.includes('Previous attempt failed:') || !retryMessage.includes('old line 100')) {
  throw new Error('Retry failure is missing from the composed model message');
}
if (plan.steps[0].status !== 'completed') throw new Error('Edit step did not complete after the corrected retry');

console.log('## edit-file apply retry');
console.log('strict patch rejection consumes an edit-file attempt instead of crashing: OK');
console.log('applicator error is supplied to the next attempt: OK');
console.log('corrected retry completes the edit step: OK');
console.log('PASS');
