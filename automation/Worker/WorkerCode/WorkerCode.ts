import {
  CORE_STEP,
  type sCoreModuleStep,
  type sCoreSequence,
  type tCoreStep,
} from '@engine/Core/CoreSchema.js';
import { WorkerSchema } from '@engine/Step/Worker/Contract/WorkerSchema.js';
import type { sWorkerRequest, sWorkerSchema } from '@engine/Step/Worker/Contract/WorkerTsType.js';
import type { ChangeCodeAction } from '../../Action/ActionChangeCode.js';
import type { FindFileAction } from '../../Action/ActionFindFile.js';
import type { ReadFileAction } from '../../Action/ActionReadFile.js';
import type { ResearchAction } from '../../Action/ActionResearch.js';
import type { ApplyEditAction } from '../../Action/ActionApplyEdit.js';
import {
  readActionCoreResult,
  type sActionCoreRequest,
} from '../../Action/ActionCoreResult.js';
import { previousStepNumbers, previousSteps } from './WorkerCodeSequence.js';

export interface sWorkerCodeDependencies {
  readonly ActionCodeChange: ChangeCodeAction;
  readonly ActionFileFind: FindFileAction;
  readonly ActionFileRead: ReadFileAction;
  readonly ActionResearch: ResearchAction;
  readonly ActionEditApply: ApplyEditAction;
}

export interface sWorkerCodeConfig {
  readonly dependencies: sWorkerCodeDependencies;
  readonly limits?: Partial<{
    attempts: number;
    findFile: number;
    readFile: number;
    research: number;
  }>;
}

interface sWorkerCodeLimits {
  attempts: number;
  findFile: number;
  readFile: number;
  research: number;
}

const MODULE = {
  change: 'WorkerCode::ActionCodeChange',
  findFile: 'WorkerCode::ActionFileFind',
  readFile: 'WorkerCode::ActionFileRead',
  research: 'WorkerCode::ActionResearch',
  applyEdit: 'WorkerCode::ActionEditApply',
} as const;

const DEFAULT_LIMITS: sWorkerCodeLimits = {
  attempts: 5,
  findFile: 4,
  readFile: 6,
  research: 2,
};

/** WorkerCode owns its concrete capabilities while Core executes the returned schema. */
export default class WorkerCode extends WorkerSchema {
  public readonly dependencies: sWorkerCodeDependencies;
  private readonly limits: sWorkerCodeLimits;

  public constructor(config: sWorkerCodeConfig) {
    super();
    this.dependencies = config.dependencies;
    this.limits = { ...DEFAULT_LIMITS, ...config.limits };
  }

  public getSchema(request: sWorkerRequest): sWorkerSchema {
    return {
      type: CORE_STEP.SEQUENCE,
      task: request.task,
      steps: [this.changeStep(request.task, [])],
    };
  }

  private changeStep(task: unknown, contextSteps: readonly number[]): sCoreModuleStep {
    return {
      module: MODULE.change,
      task,
      input: {
        context: {
          parent: true,
          ...(contextSteps.length > 0 ? { steps: contextSteps } : {}),
        },
      },
      transition: (sequence, stepNumber) => this.transitionChange(sequence, stepNumber),
    };
  }

  private transitionChange(sequence: sCoreSequence, stepNumber: number): void {
    const step = sequence.steps[stepNumber - 1];
    if (!step || !('module' in step)) return;

    const result = readActionCoreResult(step.output);
    if (!result) return;

    const task = step.task ?? sequence.task;

    if (result.status === 'completed') {
      if (hasEdit(result.data)) {
        this.replaceTail(sequence, stepNumber, [{
          module: MODULE.applyEdit,
          task,
          input: { context: { previous: true } },
        }]);
      }
      return;
    }

    if (result.status === 'failed' || !result.canContinue) return;
    if (this.countThrough(sequence, stepNumber, MODULE.change) >= this.limits.attempts) return;

    if (result.retry) {
      const contextSteps = this.contextSteps(sequence, stepNumber + 1);
      this.replaceTail(sequence, stepNumber, [this.changeStep(task, contextSteps)]);
      return;
    }

    const requests = result.requests ?? [];
    if (requests.length === 0) return;

    const planned = this.planRequests(sequence, stepNumber, requests);
    if (planned === undefined) return;

    const retrievalSteps = planned.map(({ module, input }) => ({ module, task: input }));
    this.replaceTail(sequence, stepNumber, retrievalSteps);

    const contextSteps = this.contextSteps(sequence, sequence.steps.length + 1);
    sequence.steps.push(this.changeStep(task, contextSteps));
  }

  private planRequests(
    sequence: sCoreSequence,
    stepNumber: number,
    requests: ReadonlyArray<sActionCoreRequest>,
  ): Array<{ module: string; input: unknown }> | undefined {
    const planned: Array<{ module: string; input: unknown }> = [];

    for (const request of requests) {
      const route = this.route(request.actionId);
      if (!route) continue;

      const candidate = { module: route.module, input: request.input };
      if (this.wasRequested(sequence, stepNumber, candidate) || planned.some((item) => sameRequest(item, candidate))) {
        continue;
      }

      const existing = this.countThrough(sequence, stepNumber, route.module);
      const pending = planned.filter((item) => item.module === route.module).length;
      if (existing + pending >= this.limits[route.limit]) return undefined;

      planned.push(candidate);
    }

    return planned;
  }

  private route(actionId: string): { module: string; limit: 'findFile' | 'readFile' | 'research' } | undefined {
    if (actionId === 'find-file') return { module: MODULE.findFile, limit: 'findFile' };
    if (actionId === 'read-file') return { module: MODULE.readFile, limit: 'readFile' };
    if (actionId === 'research') return { module: MODULE.research, limit: 'research' };
    return undefined;
  }

  private contextSteps(sequence: sCoreSequence, stepNumber: number): number[] {
    return previousStepNumbers(sequence, stepNumber, (step) =>
      isModule(step, MODULE.findFile) ||
      isModule(step, MODULE.readFile) ||
      isModule(step, MODULE.research));
  }

  private countThrough(sequence: sCoreSequence, stepNumber: number, module: string): number {
    return previousSteps(sequence, stepNumber + 1, (step) => isModule(step, module)).length;
  }

  private wasRequested(
    sequence: sCoreSequence,
    stepNumber: number,
    candidate: { module: string; input: unknown },
  ): boolean {
    return previousSteps(sequence, stepNumber + 1, (step) =>
      'module' in step &&
      step.module === candidate.module &&
      sameValue(step.task, candidate.input)).length > 0;
  }

  private replaceTail(sequence: sCoreSequence, stepNumber: number, next: sCoreModuleStep[]): void {
    sequence.steps.splice(stepNumber, sequence.steps.length - stepNumber, ...next);
  }
}

function isModule(step: tCoreStep, module: string): step is sCoreModuleStep {
  return 'module' in step && step.module === module;
}

function hasEdit(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'edit' in data && Boolean((data as { edit?: unknown }).edit);
}

function sameRequest(
  left: { module: string; input: unknown },
  right: { module: string; input: unknown },
): boolean {
  return left.module === right.module && sameValue(left.input, right.input);
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableValue(left) === stableValue(right);
}

function stableValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, Object.keys(value as object).sort());
  } catch {
    return String(value);
  }
}
