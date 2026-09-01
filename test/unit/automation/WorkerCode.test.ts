import { describe, expect, it } from 'vitest';
import { EngineRuntime } from '@engine/Core/EngineRuntime.js';
import { EngineSchema } from '@engine/Core/EngineSchema.js';
import { ENGINE_STEP, type sEngineOutput, type sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import WorkerCode from '@automation/Step/Worker/WorkerCode/WorkerCode.js';
import { actionCoreResult } from '@automation/Step/Action/ActionCoreResult.js';
import {
  actionChangeCodeResult,
  readActionChangeCodeResult,
} from '@automation/Step/Action/ActionChangeCodeResult.js';

class ChangeCodeStub extends StepAction {
  public readonly contextSizes: number[] = [];
  private attempt = 0;

  public getId(): string {
    return 'change-code';
  }

  public async run(step: sEngineSchemaStep): Promise<sEngineOutput> {
    this.attempt += 1;
    this.contextSizes.push(step.runtime?.context?.steps.length ?? 0);

    if (this.attempt === 1) {
      return actionChangeCodeResult({
        status: 'need-context',
        reason: 'Need the target file.',
        requests: [{ actionId: 'read-file', input: { path: 'src/example.ts' } }],
      });
    }

    return actionChangeCodeResult({
      status: 'ready-edit',
      summary: 'Update the target file.',
      edit: {
        strategy: 'range-replace',
        edits: [{ path: 'src/example.ts', instruction: 'Apply the requested change.' }],
      },
    });
  }
}

class ReadFileStub extends StepAction {
  public getId(): string {
    return 'read-file';
  }

  public async run(step: sEngineSchemaStep): Promise<sEngineOutput> {
    return actionCoreResult({
      status: 'completed',
      data: {
        path: (step.task as { path: string }).path,
        content: 'export const value = 1;',
      },
    });
  }
}

class ApplyEditStub extends StepAction {
  public getId(): string {
    return 'apply-edit';
  }

  public async run(step: sEngineSchemaStep, _dependencies: tEngineRunDependencies): Promise<sEngineOutput> {
    const change = readActionChangeCodeResult(step.runtime?.context?.previous?.output);
    if (!change || change.status !== 'ready-edit') {
      return actionCoreResult({ status: 'failed', reason: 'Missing ready edit.', canContinue: false });
    }

    return actionCoreResult({
      status: 'completed',
      data: { summary: change.summary },
    });
  }
}

describe('WorkerCode', () => {
  it('uses ChangeCode semantic results to request context and then apply the ready edit', async () => {
    const change = new ChangeCodeStub();
    const runtime = new EngineRuntime({
      groups: {
        worker: { schema: { allowedGroups: ['action'] } },
        action: { schema: false },
      },
      modules: {
        WorkerCode: new WorkerCode(),
        ActionCodeChange: change,
        ActionFileRead: new ReadFileStub(),
        ActionEditApply: new ApplyEditStub(),
      },
    });
    const schema = new EngineSchema([{
      type: ENGINE_STEP.SEQUENCE,
      module: 'WorkerCode',
      task: 'Change src/example.ts',
      steps: null,
    }]);

    const result = await runtime.run(schema);

    expect(result.status).toBe('SUCCESS');
    expect(change.contextSizes).toEqual([0, 1]);

    const workerSequence = schema.value[0]?.runtime?.schema ?? [];
    expect(workerSequence.map((step) => step.module)).toEqual([
      'ActionCodeChange',
      'ActionFileRead',
      'ActionCodeChange',
      'ActionEditApply',
    ]);
    expect(workerSequence[3]?.runtime?.context?.previous).toBe(workerSequence[2]);
  });
});
