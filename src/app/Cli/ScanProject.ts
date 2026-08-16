import type { ProjectFileIndex } from '@engine/Project/File/ProjectFileIndex.js';

/** App-level administrative command kept outside Engine task orchestration. */
export async function scanProject(scan: () => Promise<ProjectFileIndex>): Promise<number> {
  const index = await scan();
  return index.files.length;
}
