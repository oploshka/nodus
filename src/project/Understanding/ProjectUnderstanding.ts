import type { Project } from '@project/Project';

export interface ProjectUnderstanding {
  project: Project;
  summary: string;
  files: Record<string, string>;
}