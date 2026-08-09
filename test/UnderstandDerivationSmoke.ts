// UnderstandDerivationSmoke.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';
import type { ModelExecutionInput } from '@model/Controller/ModelController';
import type { ToolCallRequest } from '@model/Result/OperationResult';

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
    action: 'identify-pattern',
    subject: 'CLI registration pattern',
    goal: 'Understand how CLI registration works',
    status: 'pending',
    maxAttempts: 1,
    inputs: ['cli.file'],
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
  outputs: ['cli.file'],
}, {
  goalSatisfied: true,
  findings: ['CLI file located.'],
  evidence: [{ path: 'src/cli/Cli.ts', fact: 'CLI file located.' }],
  missing: [],
  facts: [{ key: 'cli.file', value: 'src/cli/Cli.ts', evidence: [{ path: 'src/cli/Cli.ts', fact: 'CLI file located.' }] }],
});

let modelCalls = 0;
let evaluatorCalls = 0;
let toolCalls = 0;
const modelController = {
  execute: async (input: ModelExecutionInput) => {
    modelCalls += 1;
    if (modelCalls === 1) {
      return {
        status: 'continue' as const,
        message: 'Need the located CLI source.',
        toolCalls: [{ tool: 'file-system', input: { action: 'read', path: 'src/cli/Cli.ts' } }],
        changes: [],
        observations: [],
        stepResult: {
          goalSatisfied: false,
          findings: [],
          evidence: [],
          missing: ['src/cli/Cli.ts source'],
          facts: [],
        },
      };
    }

    const source = input.execution.getToolContext()[0]?.result.data;
    assert(typeof source === 'string' && source.includes('COMMANDS'), 'second understand call must receive the requested raw source');
    input.execution.consumeToolContext();
    return {
      status: 'completed' as const,
      message: 'CLI pattern understood.',
      toolCalls: [],
      changes: [],
      observations: [],
      stepResult: {
        goalSatisfied: true,
        findings: ['Commands are listed in COMMANDS and handled by runCli branches.'],
        evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'COMMANDS + inline handlers.' }],
        missing: [],
        facts: [{ key: 'cli.integration', value: 'Add a COMMANDS entry and an inline runCli handler.', evidence: [] }],
      },
    };
  },
};

const executor = new PlanExecutor(
  { get: () => ({ id: 'understand' }) } as never,
  modelController as never,
  {
    execute: async (calls: ToolCallRequest[], currentExecution: Execution) => {
      toolCalls += calls.length;
      currentExecution.setToolContext(calls.map((call) => ({
        call,
        result: { ok: true, data: `const COMMANDS = [{ name: '/help' }];\nexport async function runCli() {}\n` },
      })), 1);
      return { requested: calls.length, executed: calls.length, success: calls.length, failed: 0, useful: calls.length };
    },
  } as never,
  {} as never,
  {} as never,
  {
    assessStepSatisfaction: async () => { evaluatorCalls += 1; throw new Error('understand must not use a separate semantic satisfaction model'); },
    assessToolEvidence: async () => { evaluatorCalls += 1; throw new Error('understand must not use a separate tool evidence model'); },
  } as never,
  {} as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {
    planStep() {}, contextCompose() {}, note() {}, factsMerged() {}, stepResult() {}, tools() {}, planAdvance() {},
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
assert(result === 'finished', 'plan run should terminate');
assert(modelCalls === 2, `expected understand -> read -> understand, got ${modelCalls} model calls`);
assert(toolCalls === 1, `expected one requested source read, got ${toolCalls}`);
assert(evaluatorCalls === 0, `no semantic/evidence evaluator should run between understand rounds, got ${evaluatorCalls}`);
assert(executionContext.has('cli.integration'), 'understand output should be stored under the exact postcondition key');
assert(plan.steps[0].status === 'completed', 'understand step should complete from its own second response');

console.log('## Understand direct flow smoke test');
console.log('understand -> requested read -> understand: OK');
console.log('no semantic/evidence evaluator inserted between rounds: OK');
console.log('raw requested source reaches the next understand call: OK');
console.log('PASS: understand owns semantic interpretation of its requested evidence.');
