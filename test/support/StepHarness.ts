// StepHarness.ts
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import type { PlanStep, TaskPlan } from '@agent/Planning/TaskPlan';
import { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';
import type { ModelExecutionInput } from '@model/Controller/ModelController';
import type { OperationResult, StepEvidenceItem, ToolCallRequest } from '@model/Result/OperationResult';
import type { FileChange } from '@core/Change/ChangeSet';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';

export interface SeedFact {
  key: string;
  value: string;
  evidence?: StepEvidenceItem[];
}

export interface PlanHarnessOptions {
  plan: TaskPlan;
  taskDescription?: string;
  seedFacts?: SeedFact[];
  operationRegistry?: OperationRegistry;
  model: (input: ModelExecutionInput, call: number) => Promise<OperationResult> | OperationResult;
  tool?: (calls: ToolCallRequest[], execution: Execution) => Promise<number> | number;
  change?: (changes: FileChange[]) => Promise<void> | void;
}

export interface StepHarnessOptions extends Omit<PlanHarnessOptions, 'plan'> {
  step: PlanStep;
}

export interface StepHarnessResult {
  state: PlanExecutionState;
  modelCalls: number;
  toolCalls: number;
  appliedChanges: FileChange[];
  recoveryCalls: number;
}

export async function runStepHarness(options: StepHarnessOptions): Promise<StepHarnessResult> {
  return runPlanHarness({
    ...options,
    plan: {
      version: 1,
      goal: options.step.goal,
      steps: [{ ...options.step }],
    },
  });
}

export async function runPlanHarness(options: PlanHarnessOptions): Promise<StepHarnessResult> {
  const task = new Task({
    projectId: 'test-project',
    conversationId: 'test-conversation',
    description: options.taskDescription ?? 'status command stage test',
  });
  const conversation = new Conversation('test-project', 'test-conversation');
  const execution = new Execution(task.id);
  execution.status = 'running';
  const executionContext = new ExecutionContext();

  for (const fact of options.seedFacts ?? []) {
    executionContext.mergeStepResult({
      id: `seed:${fact.key}`,
      type: 'search',
      action: 'find-files',
      subject: fact.key,
      goal: fact.key,
      status: 'completed',
      maxAttempts: 1,
      inputs: [],
      outputs: [fact.key],
    }, {
      goalSatisfied: true,
      findings: [fact.value],
      evidence: fact.evidence ?? [],
      missing: [],
      facts: [{ key: fact.key, value: fact.value, evidence: fact.evidence ?? [] }],
    });
  }

  let modelCalls = 0;
  let toolCalls = 0;
  let recoveryCalls = 0;
  const appliedChanges: FileChange[] = [];

  const executor = new PlanExecutor(
    options.operationRegistry ?? ({ get: (id: string) => ({ id }) } as never),
    {
      execute: async (input: ModelExecutionInput) => {
        modelCalls += 1;
        return options.model(input, modelCalls);
      },
    } as never,
    {
      execute: async (calls: ToolCallRequest[], currentExecution: Execution) => {
        toolCalls += calls.length;
        const executed = options.tool ? await options.tool(calls, currentExecution) : 0;
        return {
          requested: calls.length,
          executed,
          success: executed,
          failed: Math.max(0, calls.length - executed),
          useful: executed,
        };
      },
    } as never,
    {
      prepare: async (changes: FileChange[]) => changes.map((change) => ({
        change, path: change.path,
        resultingContent: change.type === 'write' ? change.content : change.type === 'patch'
          ? change.hunks.flatMap((hunk) => hunk.lines.filter((line) => line.type !== 'remove').map((line) => line.text)).join('\n')
          : undefined,
        originalContent: '',
      })),
      commit: async (prepared: Array<{ change: FileChange }>) => {
        const changes = prepared.map((item) => item.change);
        appliedChanges.push(...changes);
        await options.change?.(changes);
      },
      apply: async (changes: FileChange[]) => {
        appliedChanges.push(...changes);
        await options.change?.(changes);
      },
    } as never,
    { ask: async () => 'stop' } as never,
    {
      recover: async () => {
        recoveryCalls += 1;
        return { action: 'request-human', reason: 'unexpected recovery in test harness', steps: [] };
      },
    } as never,
    { insertBefore() {}, markPendingFrom() {} } as never,
    { info: async () => {}, error: async () => {}, warn: async () => {}, debug: async () => {} } as never,
    {
      planStep() {}, contextCompose() {}, note() {}, factsMerged() {}, stepResult() {}, tools() {}, changes() {},
      planAdvance() {}, recovery() {}, recoveryDecision() {}, paused() {}, planUpdated() {}, recoveryPruned() {},
      stepAlreadySatisfiedAt() {}, deterministicStep() {}, retrieval() {}, requirementResolution() {}, requirementRechecked() {}, stepContinuation() {},
    } as never,
  );

  const plan: TaskPlan = {
    ...options.plan,
    steps: options.plan.steps.map((step) => ({ ...step })),
  };

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

  await executor.run(state);
  return { state, modelCalls, toolCalls, appliedChanges, recoveryCalls };
}
