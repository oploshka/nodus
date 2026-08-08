import type { Project } from '@project/Project';
import type { ProjectUnderstanding } from '@project/Understanding/ProjectUnderstanding';

export class ProjectUnderstandingService {
  understand(project: Project): Promise<ProjectUnderstanding> {
    return Promise.resolve({
      project,
      summary: '',
      files: {}
    });
  }
}