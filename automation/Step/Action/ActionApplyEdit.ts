import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { actionCoreResult, readActionCoreResult } from './ActionCoreResult.js';

interface EditRuntime {
  change(task: unknown, request: unknown): Promise<{
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
    if (!edit) throw new Error('ActionEditApply requires runtime edit dependency.');

    const result = await edit.change(step.task, change.data.edit);
    if (result.status === 'not-completed') {
      return actionCoreResult({
        status: 'not-completed',
        reason: result.reason ?? 'Edit could not be completed.',
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
