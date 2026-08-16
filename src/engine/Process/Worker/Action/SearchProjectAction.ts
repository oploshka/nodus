import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import type { ProjectFileSearch } from '@engine/Project/File/ProjectFileSearch.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { sWorkerSearchContext } from '@engine/Worker/WorkerContext.js';

export interface sSearchProjectActionInput {
  query: string;
  limit?: number;
}

/** Cheap bounded lookup over ProjectFileIndex. */
export class SearchProjectAction implements WorkerAction<sSearchProjectActionInput, sWorkerSearchContext> {
  public readonly id = 'search';
  public readonly presentation = new ActionPresentation({ name: { en: 'Project search', ru: 'Поиск по проекту' } });
  public readonly name = this.presentation.name();
  public readonly description = 'Find likely project files without model analysis.';

  public constructor(private readonly search: ProjectFileSearch, private readonly maxResults = 12) {}

  public async run(input: sSearchProjectActionInput) {
    const query = input.query.trim();
    if (!query) return { status: 'failed' as const, reason: 'Search query is empty.', canContinue: false as const };
    const limit = Math.max(1, Math.min(input.limit ?? 8, this.maxResults));
    const paths = this.search.search(query, limit).map((file) => file.path);
    return { status: 'completed' as const, data: { kind: 'search' as const, query, paths } };
  }
}
