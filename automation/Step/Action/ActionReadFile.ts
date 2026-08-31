import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import { actionCoreResult } from './ActionCoreResult.js';

export interface sReadFileActionInput {
  path: string;
}

/** Cheap task-local read of one already known project file. */
export class ReadFileAction extends StepAction {
  public getId(): string {
    return 'read-file';
  }

  public async run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return actionCoreResult(await this.perform(step.task as sReadFileActionInput, dependencies));
  }

  private async perform(input: sReadFileActionInput, dependencies: tEngineRunDependencies) {
    const path = input.path.trim();
    if (!path) return { status: 'failed' as const, reason: 'File read path is empty.', canContinue: false as const };

    try {
      const fileSystem = projectFileSystem(dependencies);
      return { status: 'completed' as const, data: { kind: 'read' as const, path, content: await fileSystem.read(path) } };
    } catch (error) {
      return { status: 'not-completed' as const, reason: error instanceof Error ? error.message : String(error), canContinue: true as const };
    }
  }
}

function projectFileSystem(dependencies: tEngineRunDependencies): FileSystem {
  const target = dependencies.target as { fileSystem?: FileSystem } | undefined;
  if (!target?.fileSystem) throw new Error('ActionFileRead requires runtime target.fileSystem.');
  return target.fileSystem;
}
