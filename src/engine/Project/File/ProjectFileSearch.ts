import { ProjectFileIndex, type ProjectFileIndex as ProjectFileIndexState, type ProjectFileInfo } from './ProjectFileIndex.js';

/**
 * Legacy adapter for callers that have not migrated to ProjectFileIndex yet.
 * Search behavior belongs to ProjectFileIndex; this class contains no search logic.
 */
export class ProjectFileSearch {
  public constructor(private readonly index: () => ProjectFileIndexState | undefined) {}

  public search(question: string, limit = 6): ProjectFileInfo[] {
    const state = this.index();
    return state ? new ProjectFileIndex(state).findFiles(question, limit) : [];
  }
}
