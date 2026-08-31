import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import type { ProjectEditRequest } from '@engine/Process/Edit/EditTypes.js';
import type { ProjectEditResult } from '@engine/Process/Edit/ProjectEditor.js';
import { actionCoreResult, readActionCoreResult } from './ActionCoreResult.js';

interface ChangeCodeActionData {
  summary: string;
  edit?: ProjectEditRequest;
}

interface EditRuntime {
  change(task: unknown, step: unknown, request: ProjectEditRequest): Promise<ProjectEditResult>;
}

/** Prepares semantic edit intents in the Engine-owned task-local edit state. */
export class ApplyEditAction extends EngineStep {
  public getId(): string {
    return 'apply-edit';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    const change = readActionCoreResult<ChangeCodeActionData>(step.computedContext?.previous?.output);
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
    if (!edit) throw new Error('ActionEditApply requires Engine run edit state.');

    const result = await edit.change(
      { description: String(step.task ?? '') },
      step,
      change.data.edit,
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
