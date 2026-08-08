// ProjectIndex.ts

export interface ProjectFile {
  path: string;
  content?: string;
  language?: string;
}

export interface ProjectIndex {
  files: ProjectFile[];
}