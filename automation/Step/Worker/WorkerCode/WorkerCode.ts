import { EngineStep } from '@engine/EngineStep.js';
import type { EngineDsl } from '@engine/EngineDsl.js';
import type { tEnginePointContext } from '@engine/EnginePoint.js';
import type { tEngineStepContext } from '@engine/EngineStepContext.js';
import { ApplyEditAction } from '@automation/Step/Action/ActionApplyEdit.js';
import {
  ChangeCodeAction,
  type sChangeCodeActionData,
  type tChangeCodeActionId,
  type tChangeCodeRequestInput,
} from '@automation/Step/Action/ActionChangeCode.js';
import {
  readActionCoreResult,
  type tActionCoreResult,
} from '@automation/Step/Action/ActionCoreResult.js';
import { ReadFileAction } from '@automation/Step/Action/ActionReadFile.js';

const MAX_ATTEMPTS = 5;
const MAX_READ_FILE_REQUESTS = 6;

interface sWorkerCodeContext extends tEngineStepContext {
  task: unknown;
  evidence: unknown[];
}

interface sChangePointContext extends tEnginePointContext {
  attempts: number;
}

interface sReadPointContext extends tEnginePointContext {
  calls: number;
}

/** WorkerCode expressed as a local Point flow: change -> read -> change -> apply. */
export default class WorkerCode extends EngineStep {
  private readonly points = {
    change: this.point({
      name: 'change-code',
      step: new ChangeCodeAction(),
      options: () => [
        {
          point: this.points.read,
          available: ({ nextContext }) => {
            const state = nextContext as sReadPointContext | undefined;
            return (state?.calls ?? 0) < MAX_READ_FILE_REQUESTS;
          },
        },
      ],
      createContext: () => ({ attempts: 0 }),
      response: async (result, dsl, context, stepContext) => this.handleChange(
        result,
        dsl,
        context as sChangePointContext,
        stepContext as sWorkerCodeContext,
      ),
    }),

    read: this.point({
      name: 'read-file',
      step: new ReadFileAction(),
      createContext: () => ({ calls: 0 }),
      response: async (result, _dsl, context) => {
        const state = context as sReadPointContext;
        state.calls += 1;
        return result;
      },
    }),

    apply: this.point({
      name: 'apply-edit',
      step: new ApplyEditAction(),
      response: async (result) => result,
    }),
  };

  public getId(): string {
    return 'WorkerCode';
  }

  public getGroup(): string {
    return 'worker';
  }

  public createContext(input: unknown): sWorkerCodeContext {
    const worker = readWorkerInput(input);
    return {
      task: worker.task,
      evidence: [...worker.context],
    };
  }

  public async run(_input: unknown): Promise<unknown> {
    return this.points.change;
  }

  private async handleChange(
    output: unknown,
    dsl: EngineDsl,
    pointContext: sChangePointContext,
    stepContext: sWorkerCodeContext,
  ): Promise<unknown> {
    const change = readActionCoreResult<sChangeCodeActionData, tChangeCodeRequestInput>(output);
    if (!change) throw new Error('ActionCodeChange returned an invalid result.');

    pointContext.attempts += 1;

    if (change.status === 'completed') {
      if (!change.data.edit) return change;

      const value = await dsl.runPoint(this.points.apply, {
        task: stepContext.task,
        change,
      });
      return value;
    }

    if (change.status === 'failed' || pointContext.attempts >= MAX_ATTEMPTS) {
      return change;
    }

    if (change.retry) {
      const value = await dsl.runPoint(this.points.change, changeInput(stepContext, dsl));
      return value;
    }

    const requests = change.requests ?? [];
    if (requests.length === 0) return change;

    for (const request of requests) {
      if (!availableActionIds(dsl).includes(request.actionId as tChangeCodeActionId)) {
        return unavailableRequest(request.actionId);
      }
      if (request.actionId !== 'read-file') {
        return unsupportedRequest(request.actionId);
      }

      const output = await dsl.runPoint(this.points.read, request.input);
      const read = readActionCoreResult(output);
      if (!read) throw new Error('ActionFileRead returned an invalid result.');
      if (read.status !== 'completed') return read;

      stepContext.evidence.push(read.data);
    }

    const value = await dsl.runPoint(this.points.change, changeInput(stepContext, dsl));
    return value;
  }
}

function changeInput(
  context: sWorkerCodeContext,
  dsl: EngineDsl,
): {
  task: unknown;
  context: readonly unknown[];
  actions: readonly tChangeCodeActionId[];
} {
  return {
    task: context.task,
    context: context.evidence,
    actions: availableActionIds(dsl),
  };
}

function availableActionIds(dsl: EngineDsl): tChangeCodeActionId[] {
  return dsl.available()
    .map((point) => point.name)
    .filter(isChangeCodeActionId);
}

function isChangeCodeActionId(value: unknown): value is tChangeCodeActionId {
  return value === 'find-file' || value === 'read-file' || value === 'research';
}

function readWorkerInput(input: unknown): { task: unknown; context: readonly unknown[] } {
  if (!isRecord(input) || !('task' in input)) {
    return { task: input, context: [] };
  }

  return {
    task: input.task,
    context: readContext(input.context),
  };
}

function readContext(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  return [];
}

function unavailableRequest(actionId: string): tActionCoreResult<never> {
  return {
    status: 'failed',
    reason: `WorkerCode received unavailable action '${actionId}'.`,
    canContinue: false,
  };
}

function unsupportedRequest(actionId: string): tActionCoreResult<never> {
  return {
    status: 'failed',
    reason: `WorkerCode Point flow does not support '${actionId}' yet.`,
    canContinue: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
