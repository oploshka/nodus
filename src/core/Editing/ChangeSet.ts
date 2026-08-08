// ChangeSet.ts

import type { FileChange } from '@core/Editing/FileChange';

export interface ChangeSet {
  changes: FileChange[];
}