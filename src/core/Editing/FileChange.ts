// FileChange.ts

export type FileChangeType =
  | 'create'
  | 'update'
  | 'delete';

export interface FileChange {
  path: string;
  type: FileChangeType;
  content?: string;
}