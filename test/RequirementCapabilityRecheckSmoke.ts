// RequirementCapabilityRecheckSmoke.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import { PlanUpdater } from '@agent/Planning/PlanUpdater';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';
import type { ModelExecutionInput } from '@model/Controller/ModelController';
import type { OperationResult, ToolCallRequest } from '@model/Result/OperationResult';

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'Expose and then read current index access.' });
const conversation = new Conversation('test-project', 'test-conversation');
const execution = new Execution(task.id);
execution.status = 'running';
const requirement = 'evidence:project.index.currentAccess';
let capabilityAdded = false;
let resolutionCalls = 0;
let recoveryCalls = 0;
let modelCalls = 0;
const rechecks: string[] = [];

const parent = {
  id: 'parent-search',
  type: 'search' as const,
  action: 'find-definitions' as const,
  subject: 'read-only current index access in ProjectSession.ts',
  goal: 'find read-only current index access',
  status: 'pending' as const,
  maxAttempts: 1,
  inputs: [],
  outputs: [requirement],
  sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
  requirements: [{
    ref: requirement,
    description: 'read-only current index access',
    evidenceKind: 'definition',
    sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
    constraints: ['read-only', 'existing-state', 'no-side-effects'],
  }],
};

const finalize = {
  id: 'parent-finalize',
  type: 'finalize' as const,
  action: 'summarize-result' as const,
  subject: 'current index access established',
  goal: 'report result',
  status: 'pending' as const,
  maxAttempts: 1,
  inputs: [requirement],
  outputs: ['final-result:project.index.currentAccess'],
};

const plan: TaskPlan = { version: 1, goal: parent.goal, steps: [parent, finalize] };

const reporter = new Proxy({}, {
  get(_target, property) {
    if (property === 'requirementRechecked') return (refs: string[]) => rechecks.push(...refs);
    return () => {};
  },
}) as never;

const emptyResult = (): OperationResult => ({
  status: 'completed',
  toolCalls: [],
  changes: [],
  observations: [],
});

const executor = new PlanExecutor(
  { get: (id: string) => ({ id }) } as never,
  {
    execute: async (input: ModelExecutionInput): Promise<OperationResult> => {
      modelCalls += 1;
      if (input.operation.id === 'understand') {
        return {
          ...emptyResult(),
          stepResult: {
            goalSatisfied: true,
            findings: ['Existing index field can be exposed read-only.'],
            evidence: [{ path: 'src/project/ProjectSession/Support.ts', symbol: 'index', fact: 'Existing index storage found.' }],
            missing: [],
            facts: [{
              key: 'fact:project.index.support.change',
              value: 'Expose the already-held index through a read-only accessor without scan or refresh.',
              evidence: [{ path: 'src/project/ProjectSession/Support.ts', symbol: 'index', fact: 'Existing index storage found.' }],
            }],
          },
        };
      }
      if (input.operation.id === 'edit-file') {
        return {
          ...emptyResult(),
          changes: [{
            type: 'write',
            path: 'src/project/ProjectSession/ProjectSession.ts',
            content: '// ProjectSession.ts\nexport class ProjectSession { public readonly index = undefined; }\n',
          }],
        };
      }
      if (input.operation.id === 'finalize') {
        return { ...emptyResult(), finalAnswer: 'done' };
      }
      throw new Error(`Unexpected model operation ${input.operation.id}`);
    },
  } as never,
  {
    execute: async (calls: ToolCallRequest[], current: Execution) => {
      current.setToolContext(calls.map((call) => {
        const path = String(call.input.path ?? '');
        if (call.tool === 'file-system' && call.input.action === 'read') {
          return { call, result: { ok: true, data: '// existing target source' } };
        }
        if (call.tool === 'search' && path === 'src/project/ProjectSession/Support.ts') {
          return { call, result: { ok: true, data: [{ path, line: 1, text: 'public index?: ProjectIndex;' }] } };
        }
        if (call.tool === 'search' && path === 'src/project/ProjectSession/ProjectSession.ts' && capabilityAdded) {
          return { call, result: { ok: true, data: [{ path, line: 1, text: 'public get currentIndex(): ProjectIndex | undefined' }] } };
        }
        return { call, result: { ok: true, data: [] } };
      }), 1);
      return { requested: calls.length, executed: calls.length, success: calls.length, failed: 0, useful: calls.length };
    },
  } as never,
  {
    apply: async () => { capabilityAdded = true; },
  } as never,
  { ask: async () => 'stop' } as never,
  { recover: async () => { recoveryCalls += 1; return { action: 'request-human', reason: 'unexpected recovery' }; } } as never,
  new PlanUpdater(),
  { info: async () => {}, error: async () => {}, warn: async () => {} } as never,
  reporter,
  {
    plan: async () => {
      resolutionCalls += 1;
      return {
        mode: 'capability-addition',
        reason: 'Required read-only access is absent; add one minimal supporting accessor.',
        map: {} as never,
        plan: {
          version: 1,
          goal: 'add read-only current index access',
          steps: [
            {
              id: 'cap-search',
              type: 'search',
              action: 'find-definitions',
              subject: 'existing index storage in Support.ts',
              goal: 'find existing index storage',
              status: 'pending',
              maxAttempts: 1,
              inputs: [],
              outputs: ['evidence:project.session.index.field'],
              sourceHints: ['src/project/ProjectSession/Support.ts'],
              requirements: [{ ref: 'evidence:project.session.index.field', description: 'existing index field', evidenceKind: 'definition', sourceHints: ['src/project/ProjectSession/Support.ts'] }],
            },
            {
              id: 'cap-understand',
              type: 'understand',
              action: 'determine-integration',
              subject: 'minimal read-only accessor',
              goal: 'determine minimal read-only accessor',
              status: 'pending',
              maxAttempts: 1,
              inputs: ['evidence:project.session.index.field'],
              outputs: ['fact:project.index.support.change'],
              requirements: [{ ref: 'fact:project.index.support.change', description: 'minimal read-only accessor', constraints: ['read-only', 'no-side-effects'] }],
            },
            {
              id: 'cap-prepare',
              type: 'prepare-change',
              action: 'define-change',
              subject: 'minimal supporting accessor',
              goal: 'define minimal supporting accessor',
              status: 'pending',
              maxAttempts: 1,
              inputs: ['fact:project.index.support.change'],
              outputs: ['change-definition:project.index.currentAccess.support'],
              targetPath: 'src/project/ProjectSession/ProjectSession.ts',
              requirements: [{ ref: 'change-definition:project.index.currentAccess.support', description: 'minimal supporting accessor', targetPath: 'src/project/ProjectSession/ProjectSession.ts', constraints: ['minimal-supporting-change', 'read-only', 'no-side-effects'] }],
            },
            {
              id: 'cap-edit',
              type: 'edit-file',
              action: 'apply-change',
              subject: 'minimal supporting accessor',
              goal: 'apply minimal supporting accessor',
              status: 'pending',
              maxAttempts: 1,
              inputs: ['change-definition:project.index.currentAccess.support'],
              outputs: ['change-result:project.index.currentAccess.support'],
              targetPath: 'src/project/ProjectSession/ProjectSession.ts',
            },
          ],
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
  executionContext: new ExecutionContext(),
  recoveryMissing: new Map(),
  recoveryGoals: new Set(),
  requirementResolutionAttempts: new Map(),
  requirementRechecks: new Set(),
  resumes: 0,
  startedAt: Date.now(),
};

await executor.run(state);
if (resolutionCalls !== 1) throw new Error(`Expected one capability child plan, got ${resolutionCalls}`);
if (!capabilityAdded) throw new Error('Capability child edit was not applied');
if (recoveryCalls !== 0) throw new Error('Capability resolution should avoid generic recovery');
if (!state.executionContext.has(requirement)) throw new Error('Original evidence requirement was not re-established after capability edit');
if (!rechecks.includes(requirement)) throw new Error('Original requirement was not explicitly rechecked after capability edit');
if (state.execution.status !== 'completed' || state.execution.result !== 'done') throw new Error('Parent plan did not continue after successful recheck');
if (modelCalls !== 3) throw new Error(`Expected understand + edit + final model calls, got ${modelCalls}; prepare should be deterministic`);
console.log('## capability-addition requirement recheck');
console.log('missing evidence triggered one supporting child edit: OK');
console.log('prepare-change stayed deterministic inside capability child: OK');
console.log('original evidence requirement was rerun/rechecked after the edit: OK');
console.log('parent plan continued only after exact evidence existed: OK');
console.log('PASS');
