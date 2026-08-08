// ChangeSet.ts
export type FileChange =
  | { type: 'write'; path: string; content: string }
  | { type: 'delete'; path: string };

export interface ChangeSet {
  changes: FileChange[];
}
