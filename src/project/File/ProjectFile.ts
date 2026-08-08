// ProjectFile.ts

export interface ProjectFile {
  path: string;
  extension: string;
  size: number;
  content?: string;
}