import type { tEngineEmit } from '@engine/EngineEvent.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import type { ProjectEditRequest } from '@engine/Process/Edit/EditTypes.js';
import type { ProjectEditResult } from '@engine/Process/Edit/ProjectEditor.js';
import { StepAction } from '@engine/Step/StepAction.js';
import { actionCoreResult, readActionCoreResult } from './ActionCoreResult.js';
import type { tActionCoreResult } from './ActionCoreResult.js';

interface sChangeCodeActionData {
  summary: string;
  edit?: ProjectEditRequest;
}

interface sApplyEditActionInput {
  task: unknown;
  change: unknown;
}

interface EditRuntime {
  change(task: unknown, step: unknown, request: ProjectEditRequest, emit: tEngineEmit): Promise<ProjectEditResult>;
}

/** Applies one completed change-code result supplied explicitly by the parent Worker Point. */
export class ApplyEditAction extends StepAction {
  public getId(): string {
    return 'apply-edit';
  }

  public async run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<unknown>> {
    const { task, change: output } = readInput(input);
    const change = readActionCoreResult<sChangeCodeActionData>(output);
    if (!change || change.status !== 'completed') {
      return actionCoreResult({
        status: 'failed',
        reason: 'ActionEditApply requires a completed ActionCodeChange result.',
        canContinue: false,
      });
    }

    if (!change.data.edit) {
      return actionCoreResult({ status: 'completed', data: { summary: change.data.summary } });
    }

    const edit = dependencies.edit as EditRuntime | undefined;
    const emit = dependencies.emit as tEngineEmit | undefined;
    if (!edit || !emit) throw new Error('ActionEditApply requires Engine run edit state and emit.');

    const result = await edit.change(
      { description: describeTask(task) },
      { task },
      change.data.edit,
      emit,
    );

    if (result.status === 'not-completed') {
      return actionCoreResult({
        status: 'not-completed',
        reason: result.reason,
        canContinue: true,
      });
    }

    return actionCoreResult({
      status: 'completed',
      data: {
        summary: change.data.summary,
        edit: {
          files: result.files,
          operations: result.operations,
          strategy: result.strategy,
          paths: result.paths,
        },
      },
    });
  }
}

function readInput(input: unknown): sApplyEditActionInput {
  if (typeof input !== 'object' || input === null) return { task: input, change: undefined };
  const value = input as { task?: unknown; change?: unknown };
  return { task: value.task, change: value.change };
}

function describeTask(task: unknown): string {
  if (typeof task === 'string') return task;
  if (task === undefined) return '';
  try {
    return JSON.stringify(task);
  } catch {
    return String(task);
  }
}
