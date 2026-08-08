// ContextItem.ts

export type ContextItemType =
  | 'task'
  | 'file'
  | 'tool'
  | 'message'
  | 'knowledge';

export interface ContextItem {
  type: ContextItemType;
  content: unknown;
}