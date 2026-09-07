import type { iProjectFileIndex } from '@engine/Project/File/Index/ProjectFileIndex.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import { actionCoreResult, type tActionCoreResult } from './ActionCoreResult.js';

export interface sFindFileActionInput {
  query: string;
  limit?: number;
}

export interface sFindFileActionData {
  kind: 'search';
  query: string;
  paths: string[];
}

/** Cheap bounded lookup that locates project file paths without reading file content. */
export class FindFileAction extends StepAction {
  public getId(): string {
    return 'find-file';
  }

  public async run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<sFindFileActionData>> {
    return actionCoreResult(await this.perform(readInput(input), dependencies));
  }

  private async perform(
    input: sFindFileActionInput,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<sFindFileActionData>> {
    const query = input.query.trim();
    if (!query) {
      return { status: 'failed', reason: 'File lookup query is empty.', canContinue: false };
    }

    try {
      const index = projectFileIndex(dependencies);
      const limit = Math.max(1, Math.min(input.limit ?? 8, 12));
      const paths = index.findFiles(query, limit).map((file) => file.path);
      return { status: 'completed', data: { kind: 'search', query, paths } };
    } catch (error) {
      return {
        status: 'not-completed',
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true,
      };
    }
  }
}

function readInput(input: unknown): sFindFileActionInput {
  if (!isRecord(input)) return { query: '' };

  return {
    query: typeof input.query === 'string' ? input.query : '',
    limit: typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? input.limit
      : undefined,
  };
}

function projectFileIndex(dependencies: tEngineRunDependencies): iProjectFileIndex {
  const target = dependencies.target as { fileIndex?: iProjectFileIndex } | undefined;
  if (!target?.fileIndex) throw new Error('ActionFileFind requires runtime target.fileIndex.');
  return target.fileIndex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
