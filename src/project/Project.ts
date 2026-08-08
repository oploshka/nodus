// Project.ts

export interface Project {
  root: string;
  files: string[];
  configuration: Record<string, unknown>;
}