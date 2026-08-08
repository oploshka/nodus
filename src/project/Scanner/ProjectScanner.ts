// ProjectScanner.ts

import type { Project } from '@project/Project';

export class ProjectScanner {
  async scan(root: string): Promise<Project> {
    return {
      root,
      files: [],
      configuration: {},
    };
  }
}