// ProjectIndexer.ts

import type { Project } from '@project/Project';
import type { ProjectIndex } from '@knowledge/Index/ProjectIndex';

export class ProjectIndexer {
  async index(project: Project): Promise<ProjectIndex> {
    return {
      files: project.files.map((path) => ({
        path,
      })),
    };
  }
}