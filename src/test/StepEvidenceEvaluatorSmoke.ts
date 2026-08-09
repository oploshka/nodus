import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'find CLI registration structure' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
execution.setToolContext([{
  call: { tool: 'file-system', input: { action: 'read', path: 'src/cli/Cli.ts' } },
  result: {
    ok: true,
    data: "const COMMANDS = [{ name: '/help' }];\nexport async function runCli() { if (value === '/help') {} }",
  },
}], 1);

const plan: TaskPlan = {
  version: 1,
  goal: 'find CLI structure',
  steps: [{
    id: 'step-1',
    type: 'search',
    goal: 'Find CLI structure and entry point for adding a command',
    status: 'running',
    maxAttempts: 3,
    inputs: [],
    outputs: ['cli.structure'],
  }],
};

const executionContext = new ExecutionContext();
let evaluatorCalls = 0;
const events: string[] = [];
const executor = new PlanExecutor(
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {
    assessToolEvidence: async () => {
      evaluatorCalls += 1;
      return {
        satisfied: true,
        reason: 'Cli.ts shows COMMANDS and runCli handlers.',
        missing: [],
        findings: ['CLI commands are declared in COMMANDS and handled in runCli.'],
        evidence: [
          { path: 'src/cli/Cli.ts', symbol: 'COMMANDS', fact: 'Command list is declared here.' },
          { path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'Command dispatch happens here.' },
        ],
        facts: [{ key: 'cli.structure', value: 'Add command to COMMANDS and handler to runCli.' }],
      };
    },
  } as never,
  {} as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {
    evidenceCheck() { events.push('check'); },
    evidenceCheckResult(satisfied: boolean) { events.push(`result:${satisfied}`); },
    factsMerged(keys: string[]) { events.push(`facts:${keys.join(',')}`); },
    stepResult() {},
    planAdvance() {},
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
  stepResults: new Map([
    ['step-1', {
      goalSatisfied: false,
      findings: ['Cli.ts is the CLI file.'],
      evidence: [{ path: 'src/cli/Cli.ts', fact: 'CLI file located.' }],
      missing: ['Confirm command registration mechanism'],
      facts: [],
    }],
  ]),
  executionContext,
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  resumes: 0,
  startedAt: Date.now(),
};

const completed = await (executor as unknown as {
  evaluateToolRound(state: PlanExecutionState, step: TaskPlan['steps'][number]): Promise<boolean>;
}).evaluateToolRound(state, plan.steps[0]);

assert(completed, 'tool evidence should satisfy the search step');
assert(evaluatorCalls === 1, 'expected exactly one evidence evaluator call');
assert(executionContext.has('cli.structure'), 'evaluator must publish exact step output');
assert(plan.steps[0].status === 'completed', 'step should complete immediately after evidence evaluation');
assert(state.planIndex === 1, 'executor should advance to the next plan node');
assert(execution.getToolContext().length === 0, 'raw tool context should be discarded after successful evaluation');
assert(events.includes('result:true'), 'successful evidence evaluation should be reported');

console.log('## Step evidence evaluator smoke test');
console.log('accumulated evidence + latest tool results evaluated: OK');
console.log('exact output fact produced: OK');
console.log('search step completed without another normal search call: OK');
console.log('raw tool context cleared after success: OK');
console.log('PASS: tool rounds are gated by a dedicated evidence evaluator.');
