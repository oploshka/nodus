import type { Project } from '@project/Project';

export class ProjectScanner {
  scan(path: string): Promise<Project> {
    return Promise.resolve({
      path,
      name: path
    });
  }
}