export interface sProjectFileInfo {
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
  imports: string[];
  exports: string[];
}

export interface sProjectFileIndexState {
  version: 1;
  projectId: string;
  root: string;
  scannedAt: string;
  files: sProjectFileInfo[];
}

/**
 * Runtime representation of structural project-file knowledge.
 *
 * Scanning and persistence stay outside this class; this component owns the
 * loaded index state and the operations that make that state useful.
 */
export class ProjectFileIndex {
  public constructor(private state: sProjectFileIndexState) {}

  public get files(): ReadonlyArray<sProjectFileInfo> {
    return this.state.files;
  }

  public replace(state: sProjectFileIndexState): void {
    this.state = state;
  }

  public snapshot(): sProjectFileIndexState {
    return this.state;
  }

  public list(): ReadonlyArray<sProjectFileInfo> {
    return this.state.files;
  }

  public get(path: string): sProjectFileInfo | undefined {
    const normalized = normalizePath(path);
    return this.state.files.find((file) => normalizePath(file.path) === normalized);
  }

  public has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  public findFiles(question: string, limit = 6): sProjectFileInfo[] {
    const files = this.state.files;
    const tokens = Array.from(new Set(question.toLowerCase().match(/[a-zа-яё0-9_$-]{3,}/gi) ?? []));
    const scored = files.map((file) => {
      const haystack = [file.path, ...file.imports, ...file.exports].join(' ').toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (file.path.toLowerCase().includes(token)) score += 5;
        if (haystack.includes(token)) score += 2;
      }
      if (/cli|command/.test(question.toLowerCase()) && /Cli/i.test(file.path)) score += 8;
      if (/conversation/.test(question.toLowerCase()) && /conversation/i.test(file.path)) score += 8;
      if (/index|project/.test(question.toLowerCase()) && /project|index/i.test(file.path)) score += 4;
      return { file, score };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
      .slice(0, limit)
      .map((item) => item.file);
  }
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

// Compatibility names for callers that still use the pre-convention type names.
export type ProjectFileInfo = sProjectFileInfo;
export type ProjectFileFact = sProjectFileInfo;
export type ProjectIndex = sProjectFileIndexState;
