export interface FileFact {
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
  imports: string[];
  exports: string[];
}

/** Structural facts discovered from the project's files. */
export interface FileMap {
  version: 1;
  projectId: string;
  root: string;
  scannedAt: string;
  files: FileFact[];
}

// Compatibility names while the old Project surface is being decomposed.
export type ProjectFileFact = FileFact;
export type ProjectIndex = FileMap;
