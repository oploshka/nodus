import {
  ENGINE_STEP,
  type sEngineSchemaStep,
} from '@engine/Core/EngineSchemaTsType.js';
import { EngineSchema } from '@engine/Core/EngineSchema.js';
import { StepWorker } from '@engine/Step/StepWorker.js';
import {
  readActionCoreResult,
  type sActionCoreRequest,
} from '@automation/Step/Action/ActionCoreResult.js';
import { previousStepNumbers, previousSteps } from './WorkerCodeSequence.js';

const ACTION_CODE_CHANGE = 'ActionCodeChange';
const ACTION_FILE_FIND = 'ActionFileFind';
const ACTION_FILE_READ = 'ActionFileRead';
const ACTION_RESEARCH = 'ActionResearch';
const ACTION_EDIT_APPLY = 'ActionEditApply';

const MAX_ATTEMPTS = 5;
const MAX_FIND_FILE_REQUESTS = 4;
const MAX_READ_FILE_REQUESTS = 6;
const MAX_RESEARCH_REQUESTS = 2;

/** WorkerCode owns orchestration only; runtime dependencies are supplied when modules execute. */
export default class WorkerCode extends StepWorker {
  public getId(): string {
    return 'WorkerCode';
  }

  public async run(step: sEngineSchemaStep): Promise<EngineSchema> {
    return new EngineSchema([this.changeStep(step.task, [])]);
  }

  private changeStep(task: unknown, contextSteps: readonly number[]): sEngineSchemaStep {
    return {
      type: ENGINE_STEP.SEQUENCE,
      module: ACTION_CODE_CHANGE,
      task,
      input: contextSteps.length > 0
        ? { context: { steps: contextSteps } }
        : undefined,
      transition: (sequence, stepNumber) => this.transitionChange(sequence, stepNumber),
      steps: null,
    };
  }

  private transitionChange(sequence: sEngineSchemaStep[], stepNumber: number): void {
    const step = sequence[stepNumber - 1];
    if (!step?.module) return;

    const result = readActionCoreResult(step.output);
    if (!result) return;

    const task = step.task;

    if (result.status === 'completed') {
      if (hasEdit(result.data)) {
        this.replaceTail(sequence, stepNumber, [{
          type: ENGINE_STEP.SEQUENCE,
          module: ACTION_EDIT_APPLY,
          task,
          input: { context: { previous: true } },
          steps: null,
        }]);
      }
      return;
    }

    if (result.status === 'failed' || !result.canContinue) return;
    if (this.countThrough(sequence, stepNumber, ACTION_CODE_CHANGE) >= MAX_ATTEMPTS) return;

    if (result.retry) {
      this.replaceTail(sequence, stepNumber, [
        this.changeStep(task, this.contextSteps(sequence, stepNumber + 1)),
      ]);
      return;
    }

    const requests = result.requests ?? [];
    if (requests.length === 0) return;

    const planned = this.planRequests(sequence, stepNumber, requests);
    if (planned === undefined) return;

    this.replaceTail(
      sequence,
      stepNumber,
      planned.map(({ module, input }) => ({
        type: ENGINE_STEP.SEQUENCE,
        module,
        task: input,
        steps: null,
      })),
    );

    sequence.push(
      this.changeStep(task, this.contextSteps(sequence, sequence.length + 1)),
    );
  }

  private planRequests(
    sequence: sEngineSchemaStep[],
    stepNumber: number,
    requests: ReadonlyArray<sActionCoreRequest>,
  ): Array<{ module: string; input: unknown }> | undefined {
    const planned: Array<{ module: string; input: unknown }> = [];

    for (const request of requests) {
      const route = this.route(request.actionId);
      if (!route) continue;

      const candidate = { module: route.module, input: request.input };
      if (this.wasRequested(sequence, stepNumber, candidate) || planned.some((item) => sameRequest(item, candidate))) continue;

      const existing = this.countThrough(sequence, stepNumber, route.module);
      const pending = planned.filter((item) => item.module === route.module).length;
      if (existing + pending >= route.limit) return undefined;

      planned.push(candidate);
    }

    return planned;
  }

  private route(actionId: string): { module: string; limit: number } | undefined {
    if (actionId === 'find-file') return { module: ACTION_FILE_FIND, limit: MAX_FIND_FILE_REQUESTS };
    if (actionId === 'read-file') return { module: ACTION_FILE_READ, limit: MAX_READ_FILE_REQUESTS };
    if (actionId === 'research') return { module: ACTION_RESEARCH, limit: MAX_RESEARCH_REQUESTS };
    return undefined;
  }

  private contextSteps(sequence: sEngineSchemaStep[], stepNumber: number): number[] {
    const contextModules = new Set([ACTION_FILE_FIND, ACTION_FILE_READ, ACTION_RESEARCH]);
    return previousStepNumbers(sequence, stepNumber, (step) => Boolean(step.module && contextModules.has(step.module)));
  }

  private countThrough(sequence: sEngineSchemaStep[], stepNumber: number, module: string): number {
    return previousSteps(sequence, stepNumber + 1, (step) => step.module === module).length;
  }

  private wasRequested(
    sequence: sEngineSchemaStep[],
    stepNumber: number,
    candidate: { module: string; input: unknown },
  ): boolean {
    return previousSteps(
      sequence,
      stepNumber + 1,
      (step) => step.module === candidate.module && sameValue(step.task, candidate.input),
    ).length > 0;
  }

  private replaceTail(sequence: sEngineSchemaStep[], stepNumber: number, next: sEngineSchemaStep[]): void {
    sequence.splice(stepNumber, sequence.length - stepNumber, ...next);
  }
}

function hasEdit(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'edit' in data && Boolean((data as { edit?: unknown }).edit);
}

function sameRequest(left: { module: string; input: unknown }, right: { module: string; input: unknown }): boolean {
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
