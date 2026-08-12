import type { Project } from '@engine/Project/Project.js';

/** App-level administrative command kept outside Engine task orchestration. */
export async function scanProject(project: Project): Promise<number> {
  const index = await project.scan();
  return index.files.length;
}
