import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { ProjectEditor } from '@engine/Edit/ProjectEditor.js';
import type { sCoreModuleRequest, tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import { actionCoreResult, readActionCoreResult } from './ActionCoreResult.js';
import type { ChangeCodeActionData } from './ActionChangeCode.js';

export interface sApplyEditActionData {
  summary: string;
  edit?: {
    files: number;
    operations: number;
    strategy: string;
    paths: string[];
  };
}

/** Applies the edit intent produced by ChangeCodeAction. Worker schema owns when this capability is called. */
export class ApplyEditAction {
  public readonly group = 'action';

  public constructor(private readonly edit: ProjectEditor) {}

  public async execute(request: sCoreModuleRequest): Promise<tCoreModuleResult> {
    const assignment = request.task as { task?: Task; step?: PlanStep };
    if (!assignment?.task || !assignment?.step) {
      return actionCoreResult<sApplyEditActionData, never>({
        status: 'failed',
        reason: 'ApplyEditAction Core task must contain task and step.',
        canContinue: false,
      });
    }

    const change = readActionCoreResult<ChangeCodeActionData>(request.context.previous);
    if (!change || change.status !== 'completed') {
      return actionCoreResult<sApplyEditActionData, never>({
        status: 'failed',
        reason: 'ApplyEditAction requires the previous completed ChangeCodeAction output.',
        canContinue: false,
      });
    }

    if (!change.data.edit) {
      return actionCoreResult<sApplyEditActionData, never>({
        status: 'completed',
        data: { summary: change.data.summary },
      });
    }

    const result = await this.edit.change(assignment.task, assignment.step, change.data.edit);
    if (result.status === 'not-completed') {
      return actionCoreResult<sApplyEditActionData, never>({
        status: 'not-completed',
        reason: result.reason,
        canContinue: true,
      });
    }

    return actionCoreResult<sApplyEditActionData, never>({
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
