import type { iProjectFileIndex } from '@engine/Project/File/Index/ProjectFileIndex.js';
import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { actionCoreResult } from './ActionCoreResult.js';

export interface sFindFileActionInput {
  query: string;
  limit?: number;
}

/** Cheap bounded lookup that locates project file paths without reading file content. */
export class FindFileAction extends EngineStep {
  public getId(): string {
    return 'find-file';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return actionCoreResult(await this.perform(step.task as sFindFileActionInput, dependencies));
  }

  private async perform(input: sFindFileActionInput, dependencies: tEngineRunDependencies) {
    const query = input.query.trim();
    if (!query) return { status: 'failed' as const, reason: 'File lookup query is empty.', canContinue: false as const };

    const index = projectFileIndex(dependencies);
    const limit = Math.max(1, Math.min(input.limit ?? 8, 12));
    const paths = index.findFiles(query, limit).map((file) => file.path);
    return { status: 'completed' as const, data: { kind: 'search' as const, query, paths } };
  }
}

function projectFileIndex(dependencies: tEngineRunDependencies): iProjectFileIndex {
  const target = dependencies.target as { fileIndex?: iProjectFileIndex } | undefined;
  if (!target?.fileIndex) throw new Error('ActionFileFind requires runtime target.fileIndex.');
  return target.fileIndex;
}
