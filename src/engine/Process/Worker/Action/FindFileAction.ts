import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import type { iProjectFileIndex } from '@engine/Project/File/ProjectFileIndex.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { sWorkerSearchContext } from '@engine/Worker/WorkerContext.js';

export interface sFindFileActionInput {
  query: string;
  limit?: number;
}

/** Cheap bounded lookup that locates project file paths without reading file content. */
export class FindFileAction implements WorkerAction<sFindFileActionInput, sWorkerSearchContext> {
  public readonly id = 'find-file';
  public readonly presentation = new ActionPresentation({ name: { en: 'Find file', ru: 'Поиск файла' } });
  public readonly name = this.presentation.name();
  public readonly description = 'Locate likely project file paths without reading file contents or model analysis.';

  public constructor(private readonly index: iProjectFileIndex, private readonly maxResults = 12) {}

  public async run(input: sFindFileActionInput) {
    const query = input.query.trim();
    if (!query) return { status: 'failed' as const, reason: 'File lookup query is empty.', canContinue: false as const };
    const limit = Math.max(1, Math.min(input.limit ?? 8, this.maxResults));
    const paths = this.index.findFiles(query, limit).map((file) => file.path);
    return { status: 'completed' as const, data: { kind: 'search' as const, query, paths } };
  }
}
