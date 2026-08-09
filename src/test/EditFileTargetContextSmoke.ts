// EditFileTargetContextSmoke.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { PlanStep, TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';
import type { ToolCallRequest } from '@model/Result/OperationResult';
import { EditFileRawProtocol } from '@model/Protocol/EditFileRawProtocol';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'edit CLI' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
const step: PlanStep = {
  id: 'edit-cli',
  type: 'edit-file',
  goal: 'Add /status to CLI',
  status: 'pending',
  maxAttempts: 3,
  inputs: [],
  outputs: ['cli.status.applied'],
  targetPath: 'src/cli/Cli.ts',
};
const plan: TaskPlan = { version: 1, goal: 'edit CLI', steps: [step] };
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
  stepProgress: new Map(),
  resumes: 0,
  startedAt: Date.now(),
};

let reads = 0;
const executor = new PlanExecutor(
  {} as never,
  {} as never,
  {
    execute: async (calls: ToolCallRequest[], currentExecution: Execution) => {
      reads += 1;
      currentExecution.setToolContext(calls.map((call) => ({
        call,
        result: { ok: true, data: "// Cli.ts\nconst COMMANDS = ['/help'];\nexport async function runCli() {}\n" },
      })), 1);
      return { requested: calls.length, executed: calls.length, success: calls.length, failed: 0, useful: calls.length };
    },
  } as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  { info: async () => {}, warn: async () => {}, error: async () => {} } as never,
  { tools() {} } as never,
);

const internals = executor as unknown as {
  ensureEditFileTargetContext(state: PlanExecutionState, step: PlanStep, context: Record<string, string>): Promise<void>;
};
const logContext = { projectId: 'test-project', conversationId: 'test-conversation', taskId: task.id, executionId: execution.id };

await internals.ensureEditFileTargetContext(state, step, logContext);
assert(reads === 1, 'target should be preloaded exactly once');
assert(String(execution.getToolContext()[0]?.result.data ?? '').includes('COMMANDS'), 'preloaded target content must be available to model context');

execution.consumeToolContext();
await internals.ensureEditFileTargetContext(state, step, logContext);
assert(reads === 1, 'cached target content should be restored without another filesystem read');
assert(execution.getToolContext().length === 1, 'cached target context should survive across edit attempts');

const editProfile = DEFAULT_OPERATION_PROFILES.find((profile) => profile.id === 'edit-file');
assert(editProfile, 'edit-file profile missing');
assert(editProfile.prompt.rules?.some((rule) => rule.includes('Do not request tools')), 'edit-file profile must explicitly forbid tool calls');
const rawInstructions = new EditFileRawProtocol().instructions('src/cli/Cli.ts');
assert(!rawInstructions.includes('TOOL <tool id>'), 'edit-file RAW instructions must not advertise a tool-call branch');
assert(rawInstructions.includes('preloads the complete authoritative target source'), 'RAW protocol must state that target source is preloaded');

console.log('## Edit-file target context smoke test');
console.log('target source preloaded before model call: OK');
console.log('target source restored across attempts without reread: OK');
console.log('edit-file protocol no longer advertises tools: OK');
console.log('PASS: edit-file receives persistent target source and cannot loop on the same read.');
