import {
  ProjectFileIndex,
  type iProjectFileIndex,
  type ProjectFileIndex as ProjectFileIndexState,
  type ProjectFileInfo,
  type sProjectFileIndexState,
} from './ProjectFileIndex.js';

/**
 * Legacy adapter for callers that have not migrated to ProjectFileIndex yet.
 * All file-index behavior delegates to ProjectFileIndex.
 */
export class ProjectFileSearch implements iProjectFileIndex {
  private overrideState?: sProjectFileIndexState;

  public constructor(private readonly index: () => ProjectFileIndexState | undefined) {}

  public get files(): ReadonlyArray<ProjectFileInfo> {
    return this.runtime()?.files ?? [];
  }

  public replace(state: sProjectFileIndexState): void {
    this.overrideState = state;
  }

  public snapshot(): sProjectFileIndexState {
    const state = this.overrideState ?? this.index();
    if (!state) throw new Error('Project file index is not available.');
    return state;
  }

  public list(): ReadonlyArray<ProjectFileInfo> {
    return this.runtime()?.list() ?? [];
  }

  public get(path: string): ProjectFileInfo | undefined {
    return this.runtime()?.get(path);
  }

  public has(path: string): boolean {
    return this.runtime()?.has(path) ?? false;
  }

  public findFiles(question: string, limit = 6): ProjectFileInfo[] {
    return this.runtime()?.findFiles(question, limit) ?? [];
  }

  public search(question: string, limit = 6): ProjectFileInfo[] {
    return this.findFiles(question, limit);
  }

  private runtime(): iProjectFileIndex | undefined {
    const state = this.overrideState ?? this.index();
    return state ? new ProjectFileIndex(state) : undefined;
  }
}
