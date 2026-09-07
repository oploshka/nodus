import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import { actionCoreResult, type tActionCoreResult } from './ActionCoreResult.js';

export interface sReadFileActionInput {
  path: string;
}

export interface sReadFileActionData {
  kind: 'read';
  path: string;
  content: string;
}

/** Cheap task-local read of one already known project file. */
export class ReadFileAction extends StepAction {
  public getId(): string {
    return 'read-file';
  }

  public async run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<sReadFileActionData>> {
    return actionCoreResult(await this.perform(readInput(input), dependencies));
  }

  private async perform(
    input: sReadFileActionInput,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<sReadFileActionData>> {
    const path = input.path.trim();
    if (!path) return { status: 'failed', reason: 'File read path is empty.', canContinue: false };

    try {
      const fileSystem = projectFileSystem(dependencies);
      return { status: 'completed', data: { kind: 'read', path, content: await fileSystem.read(path) } };
    } catch (error) {
      return {
        status: 'not-completed',
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true,
      };
    }
  }
}

function readInput(input: unknown): sReadFileActionInput {
  if (typeof input !== 'object' || input === null) return { path: '' };
  const path = (input as { path?: unknown }).path;
  return { path: typeof path === 'string' ? path : '' };
}

function projectFileSystem(dependencies: tEngineRunDependencies): FileSystem {
  const target = dependencies.target as { fileSystem?: FileSystem } | undefined;
  if (!target?.fileSystem) throw new Error('ActionFileRead requires runtime target.fileSystem.');
  return target.fileSystem;
}
