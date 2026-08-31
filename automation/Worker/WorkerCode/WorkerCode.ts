import {
  CORE_STEP,
  type sCoreModuleStep,
  type sCoreSequence,
} from '@engine/Core/CoreSchema.js';
import { WorkerSchema } from '@engine/Step/Worker/Contract/WorkerSchema.js';
import type { sWorkerRequest, sWorkerSchema } from '@engine/Step/Worker/Contract/WorkerTsType.js';
import {
  readActionCoreResult,
  type sActionCoreRequest,
  type tActionCoreResult,
} from '../../Action/ActionCoreResult.js';

export interface sWorkerCodeConfig {
  modules?: Partial<{
    change: string;
    findFile: string;
    readFile: string;
    research: string;
    applyEdit: string;
  }>;
  limits?: Partial<{
    attempts: number;
    findFile: number;
    readFile: number;
    research: number;
  }>;
}

interface sWorkerCodeState {
  attempts: number;
  findFile: number;
  readFile: number;
  research: number;
  contextSteps: number[];
  seenRequests: Set<string>;
}

interface sWorkerCodeModules {
  change: string;
  findFile: string;
  readFile: string;
  research: string;
  applyEdit: string;
}

interface sWorkerCodeLimits {
  attempts: number;
  findFile: number;
  readFile: number;
  research: number;
}

const DEFAULT_MODULES: sWorkerCodeModules = {
  change: 'ChangeCodeAction',
  findFile: 'FindFileAction',
  readFile: 'ReadFileAction',
  research: 'ResearchAction',
  applyEdit: 'ApplyEditAction',
};

const DEFAULT_LIMITS: sWorkerCodeLimits = {
  attempts: 5,
  findFile: 4,
  readFile: 6,
  research: 2,
};

/**
 * Code Worker orchestration is schema, not a second runtime.
 * Core executes the attempts, retrieval/research calls, context projection and final edit application.
 */
export default class WorkerCode extends WorkerSchema {
  private readonly modules: sWorkerCodeModules;
  private readonly limits: sWorkerCodeLimits;

  public constructor(config: sWorkerCodeConfig = {}) {
    super();
    this.modules = { ...DEFAULT_MODULES, ...config.modules };
    this.limits = { ...DEFAULT_LIMITS, ...config.limits };
  }

  public getSchema(request: sWorkerRequest): sWorkerSchema {
    const state: sWorkerCodeState = {
      attempts: 1,
      findFile: 0,
      readFile: 0,
      research: 0,
      contextSteps: [],
      seenRequests: new Set<string>(),
    };

    return {
      type: CORE_STEP.SEQUENCE,
      task: request.task,
      steps: [this.changeStep(request.task, state)],
    };
  }

  private changeStep(task: unknown, state: sWorkerCodeState): sCoreModuleStep {
    const contextSteps = [...state.contextSteps];
    return {
      module: this.modules.change,
      task,
      ...(contextSteps.length > 0 ? { input: { context: { steps: contextSteps } } } : {}),
      transition: (sequence, stepNumber) => this.transitionChange(sequence, stepNumber, task, state),
    };
  }

  private transitionChange(
    sequence: sCoreSequence,
    stepNumber: number,
    task: unknown,
    state: sWorkerCodeState,
  ): void {
    const step = sequence.steps[stepNumber - 1];
    const result = readActionCoreResult(step?.output);
    if (!result) return;

    if (result.status === 'completed') {
      if (hasEdit(result.data)) {
        this.replaceTail(sequence, stepNumber, [{
          module: this.modules.applyEdit,
          task,
          input: { context: { previous: true } },
        }]);
      }
      return;
    }

    if (result.status === 'failed' || !result.canContinue) return;
    if (state.attempts >= this.limits.attempts) return;

    if (result.retry) {
      state.attempts += 1;
      this.replaceTail(sequence, stepNumber, [this.changeStep(task, state)]);
      return;
    }

    const requests = result.requests ?? [];
    if (requests.length === 0) return;

    const planned = this.planRequests(requests, state);
    if (planned === undefined) return;

    state.attempts += 1;
    const retrievalSteps = planned.map(({ module, input }) => ({ module, task: input }));
    const firstStepNumber = stepNumber + 1;
    for (let index = 0; index < retrievalSteps.length; index += 1) {
      state.contextSteps.push(firstStepNumber + index);
    }

    this.replaceTail(sequence, stepNumber, [
      ...retrievalSteps,
      this.changeStep(task, state),
    ]);
  }

  /**
   * undefined means a configured request limit was exceeded and the current failure remains terminal.
   * An empty array means every requested operation was already performed; Core retries the semantic attempt
   * with the existing explicit context instead of accumulating a second Worker-side session store.
   */
  private planRequests(
    requests: ReadonlyArray<sActionCoreRequest>,
    state: sWorkerCodeState,
  ): Array<{ module: string; input: unknown }> | undefined {
    const planned: Array<{ module: string; input: unknown }> = [];
    const increments = { findFile: 0, readFile: 0, research: 0 };
    const seen = new Set(state.seenRequests);

    for (const request of requests) {
      const route = this.route(request.actionId);
      if (!route) continue;

      const signature = `${request.actionId}:${stableRequest(request.input)}`;
      if (seen.has(signature)) continue;

      const nextCount = state[route.limit] + increments[route.limit] + 1;
      if (nextCount > this.limits[route.limit]) return undefined;

      seen.add(signature);
      increments[route.limit] += 1;
      planned.push({ module: route.module, input: request.input });
    }

    state.findFile += increments.findFile;
    state.readFile += increments.readFile;
    state.research += increments.research;
    for (const signature of seen) state.seenRequests.add(signature);
    return planned;
  }

  private route(actionId: string): { module: string; limit: 'findFile' | 'readFile' | 'research' } | undefined {
    if (actionId === 'find-file') return { module: this.modules.findFile, limit: 'findFile' };
    if (actionId === 'read-file') return { module: this.modules.readFile, limit: 'readFile' };
    if (actionId === 'research') return { module: this.modules.research, limit: 'research' };
    return undefined;
  }

  private replaceTail(sequence: sCoreSequence, stepNumber: number, next: sCoreModuleStep[]): void {
    sequence.steps.splice(stepNumber, sequence.steps.length - stepNumber, ...next);
  }
}

function hasEdit(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'edit' in data && Boolean((data as { edit?: unknown }).edit);
}

function stableRequest(input: unknown): string {
  if (input === undefined) return 'undefined';
  try {
    return JSON.stringify(input, Object.keys(input as object).sort());
  } catch {
    return String(input);
  }
}
