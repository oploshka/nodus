export interface ProjectFileFact {
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
  imports: string[];
  exports: string[];
}

export interface ProjectIndex {
  version: 1;
  projectId: string;
  root: string;
  scannedAt: string;
  files: ProjectFileFact[];
}
