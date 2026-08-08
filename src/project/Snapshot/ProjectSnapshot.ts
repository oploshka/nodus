// ProjectSnapshot.ts
import type { ProjectIndex } from '@project/Index/ProjectIndex';

export interface ProjectSnapshot {
  schemaVersion: 1;
  projectId: string;
  root: string;
  savedAt: string;
  index?: ProjectIndex;
}
