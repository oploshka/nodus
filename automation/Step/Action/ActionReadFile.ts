import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { sCoreModuleRequest, tCoreModuleResult, tCoreRunDependencies } from '@engine/Core/CoreTsType.js';
import { actionCoreResult } from './ActionCoreResult.js';

export interface sReadFileActionInput {
  path: string;
}

/** Cheap task-local read of one already known project file. */
export class ReadFileAction {
  public readonly group = 'action';
  public readonly id = 'read-file';

  public async execute(
    request: sCoreModuleRequest,
    dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    return actionCoreResult(await this.run(request.task as sReadFileActionInput, dependencies));
  }

  public async run(input: sReadFileActionInput, dependencies: tCoreRunDependencies) {
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

function projectFileSystem(dependencies: tCoreRunDependencies): FileSystem {
  const target = dependencies.target as { fileSystem?: FileSystem } | undefined;
  if (!target?.fileSystem) throw new Error('ActionFileRead requires runtime target.fileSystem.');
  return target.fileSystem;
}
