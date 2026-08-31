import type { iProjectFileIndex } from '@engine/Project/File/Index/ProjectFileIndex.js';
import type { sCoreModuleRequest, tCoreModuleResult, tCoreRunDependencies } from '@engine/Core/CoreTsType.js';
import { actionCoreResult } from './ActionCoreResult.js';

export interface sFindFileActionInput {
  query: string;
  limit?: number;
}

/** Cheap bounded lookup that locates project file paths without reading file content. */
export class FindFileAction {
  public readonly group = 'action';
  public readonly id = 'find-file';

  public async execute(
    request: sCoreModuleRequest,
    dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    return actionCoreResult(await this.run(request.task as sFindFileActionInput, dependencies));
  }

  public async run(input: sFindFileActionInput, dependencies: tCoreRunDependencies) {
    const query = input.query.trim();
    if (!query) return { status: 'failed' as const, reason: 'File lookup query is empty.', canContinue: false as const };

    const index = projectFileIndex(dependencies);
    const limit = Math.max(1, Math.min(input.limit ?? 8, 12));
    const paths = index.findFiles(query, limit).map((file) => file.path);
    return { status: 'completed' as const, data: { kind: 'search' as const, query, paths } };
  }
}

function projectFileIndex(dependencies: tCoreRunDependencies): iProjectFileIndex {
  const target = dependencies.target as { fileIndex?: iProjectFileIndex } | undefined;
  if (!target?.fileIndex) throw new Error('ActionFileFind requires runtime target.fileIndex.');
  return target.fileIndex;
}
