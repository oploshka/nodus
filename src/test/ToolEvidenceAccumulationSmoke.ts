// ToolEvidenceAccumulationSmoke.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'understand project sources' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
const plan: TaskPlan = {
  version: 1,
  goal: 'understand project sources',
  steps: [{
    id: 'step-1',
    type: 'understand',
    action: 'trace-data-flow',
    subject: 'project status values',
    goal: 'Trace project status values',
    status: 'running',
    maxAttempts: 3,
    inputs: [],
    outputs: ['status.sources'],
  }],
};

const executor = new PlanExecutor(
  {} as never, {} as never, {} as never, {} as never, {} as never,
  { assessToolEvidence: async () => { throw new Error('evaluator must not run'); } } as never,
  {} as never,
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  {} as never,
);
const state: PlanExecutionState = {
  task, conversation, execution, plan, planIndex: 0, stepAttempts: 1,
  recoveryAttempts: new Map(), stepResults: new Map(), executionContext: new ExecutionContext(),
  recoveryMissing: new Map(), recoveryGoals: new Set(), resumes: 0, startedAt: Date.now(),
};
const record = () => (executor as unknown as {
  recordUnderstandToolRound(state: PlanExecutionState, step: TaskPlan['steps'][number]): void;
}).recordUnderstandToolRound(state, plan.steps[0]);

execution.setToolContext([{
  call: { tool: 'file-system', input: { action: 'read', path: 'src/cli/Cli.ts' } },
  result: { ok: true, data: 'configuration.project.id; conversation.id;' },
}], 1);
record();
const firstCount = state.stepResults.get('step-1')?.evidence.length ?? 0;
assert(firstCount === 1, `expected one normalized source reference, got ${firstCount}`);

execution.setToolContext([{
  call: { tool: 'file-system', input: { action: 'read', path: 'src/project/Index/ProjectIndex.ts' } },
  result: { ok: true, data: 'export interface ProjectIndex { files: ProjectFileFact[]; }' },
}], 1);
record();
const secondCount = state.stepResults.get('step-1')?.evidence.length ?? 0;
assert(secondCount === 2, `second requested source should extend accumulated evidence, got ${secondCount}`);

console.log('## Tool evidence accumulation smoke test');
console.log(`round 1 accumulated evidence: ${firstCount}`);
console.log(`round 2 accumulated evidence: ${secondCount}`);
console.log('no semantic evaluator involved: OK');
console.log('PASS: compact source references persist across understand tool rounds.');
