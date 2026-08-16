export interface ProjectFileInfo {
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
  imports: string[];
  exports: string[];
}

/**
 * Snapshot of structural facts known about project files after scanning.
 * This is one specialized representation of the project, not a universal Project state.
 */
export interface ProjectFileIndex {
  version: 1;
  projectId: string;
  root: string;
  scannedAt: string;
  files: ProjectFileInfo[];
}

// Compatibility names while old callers migrate to the explicit file index terminology.
export type ProjectFileFact = ProjectFileInfo;
export type ProjectIndex = ProjectFileIndex;
