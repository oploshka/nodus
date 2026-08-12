// RequirementResolutionRecheckSmoke.ts
import { PlannerContext } from '@planner/PlannerContext';
import { PlanExecutor, type PlanExecutionState } from '@planner/PlanExecutor';
import { PlanUpdater } from '@planner/PlanUpdater';
import type { TaskPlan } from '@planner/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';
import type { ToolCallRequest } from '@model/Result/OperationResult';

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'find exact evidence' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
const requirement = 'evidence:thing.definition';
const parent = {
  id: 'parent-search',
  type: 'search' as const,
  action: 'find-definitions' as const,
  subject: 'thing definition in Target.ts',
  goal: 'find thing definition',
  status: 'pending' as const,
  maxAttempts: 1,
  inputs: [],
  outputs: [requirement],
  sourceHints: ['src/old/Target.ts'],
  requirements: [{ ref: requirement, description: 'exact thing definition', evidenceKind: 'definition', sourceHints: ['src/old/Target.ts'] }],
};
const plan: TaskPlan = { version: 1, goal: parent.goal, steps: [parent] };
let resolutionCalls = 0;
let recoveryCalls = 0;
const rechecks: string[] = [];

const reporter = new Proxy({}, {
  get(_target, property) {
    if (property === 'requirementRechecked') return (refs: string[]) => rechecks.push(...refs);
    return () => {};
  },
}) as never;

const executor = new PlanExecutor(
  { get: () => ({ id: 'search' }) } as never,
  { execute: async () => { throw new Error('No model call expected'); } } as never,
  {
    execute: async (calls: ToolCallRequest[], current: Execution) => {
      current.setToolContext(calls.map((call) => {
        const path = String(call.input.path ?? '');
        const query = String(call.input.query ?? '');
        const exactChild = path === 'src/new/Actual.ts' && query === 'thing';
        const relatedParent = path === 'src/old/Target.ts' && query === 'Target';
        return {
          call,
          result: {
            ok: true,
            data: exactChild || relatedParent
              ? [{ path, line: 1, text: exactChild ? 'export const thing = 1;' : 'export class Target {}' }]
              : [],
          },
        };
      }), 1);
      return { requested: calls.length, executed: calls.length, success: calls.length, failed: 0, useful: calls.length };
    },
  } as never,
  {} as never,
  { ask: async () => 'stop' } as never,
  { recover: async () => { recoveryCalls += 1; return { action: 'request-human', reason: 'unexpected recovery' }; } } as never,
  new PlanUpdater(),
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  reporter,
  {
    plan: async () => {
      resolutionCalls += 1;
      return {
        reason: 'Try the grounded alternate source.',
        map: {} as never,
        plan: {
          version: 1,
          goal: 'resolve exact thing definition',
          steps: [{
            id: 'resolution-search',
            type: 'search',
            action: 'find-definitions',
            subject: 'thing definition in Actual.ts',
            goal: 'find exact thing definition',
            status: 'pending',
            maxAttempts: 1,
            inputs: [],
            outputs: [requirement],
            sourceHints: ['src/new/Actual.ts'],
            requirements: [{ ref: requirement, description: 'exact thing definition', evidenceKind: 'definition', sourceHints: ['src/new/Actual.ts'] }],
          }],
        },
      };
    },
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
  executionContext: new PlannerContext(),
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  requirementResolutionAttempts: new Map(),
  requirementRechecks: new Set(),
  resumes: 0,
  startedAt: Date.now(),
};

await executor.run(state);
if (resolutionCalls !== 1) throw new Error(`Expected one child requirement plan, got ${resolutionCalls}`);
if (recoveryCalls !== 0) throw new Error('Child requirement resolution should avoid generic recovery');
if (!state.executionContext.has(requirement)) throw new Error('Child plan did not establish the original requirement');
const parentAfter = state.plan.steps.find((step) => step.id === 'parent-search');
if (parentAfter?.status !== 'completed') throw new Error('Parent requirement was not rechecked/completed after child plan');
if (!rechecks.includes(requirement)) throw new Error('Original requirement recheck was not reported');
console.log('## requirement resolution recheck');
console.log('related parent result triggered a child plan: OK');
console.log('child exact evidence established the original requirement: OK');
console.log('parent requirement was rechecked instead of auto-assumed: OK');
console.log('PASS');
