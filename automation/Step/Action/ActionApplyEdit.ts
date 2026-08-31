import type { sCoreModuleRequest, tCoreModuleResult, tCoreRunDependencies } from '@engine/Core/CoreTsType.js';
import { actionCoreResult, readActionCoreResult } from './ActionCoreResult.js';

interface EditRuntime {
  change(task: unknown, step: unknown, request: unknown): Promise<{
    status: 'completed' | 'not-completed';
    reason?: string;
    files?: number;
    operations?: number;
    strategy?: string;
    paths?: string[];
  }>;
}

interface ChangeCodeActionData {
  summary: string;
  edit?: unknown;
}

/** Applies edit intent using the runtime edit capability supplied for this run. */
export class ApplyEditAction {
  public readonly group = 'action';

  public async execute(
    request: sCoreModuleRequest,
    dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    const assignment = request.task as { task?: unknown; step?: unknown };
    if (!assignment?.task || !assignment?.step) {
      return actionCoreResult({
        status: 'failed',
        reason: 'ActionEditApply task must contain task and step.',
        canContinue: false,
      });
    }

    const change = readActionCoreResult<ChangeCodeActionData>(request.context.previous);
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
    if (!edit) throw new Error('ActionEditApply requires runtime edit dependency.');

    const result = await edit.change(assignment.task, assignment.step, change.data.edit);
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
          files: result.files ?? 0,
          operations: result.operations ?? 0,
          strategy: result.strategy ?? '',
          paths: result.paths ?? [],
        },
      },
    });
  }
}
