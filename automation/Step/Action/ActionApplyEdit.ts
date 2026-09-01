import type { sEngineOutput, sEngineSchemaStep, tEngineEmit } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import type { ProjectEditRequest } from '@engine/Process/Edit/EditTypes.js';
import type { ProjectEditResult } from '@engine/Process/Edit/ProjectEditor.js';
import { actionCoreResult, readActionCoreResult } from './ActionCoreResult.js';

interface ChangeCodeActionData {
  summary: string;
  edit?: ProjectEditRequest;
}

interface EditRuntime {
  change(task: unknown, step: unknown, request: ProjectEditRequest, emit: tEngineEmit): Promise<ProjectEditResult>;
}

/** Prepares semantic edit intents in the Engine-owned task-local edit state. */
export class ApplyEditAction extends StepAction {
  public getId(): string {
    return 'apply-edit';
  }

  public async run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    const change = readActionCoreResult<ChangeCodeActionData>(step.runtime?.context?.previous?.output);
    if (!change || change.status !== 'completed') {
      return actionCoreResult({
        status: 'failed',
        reason: 'ActionEditApply requires the previous completed ActionCodeChange output.',
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
      { description: String(step.task ?? '') },
      step,
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
