export type ContextItemType =
  | 'instruction'
  | 'file'
  | 'knowledge'
  | 'example'
  | 'tool'
  | 'message';

export interface ContextItem {
  type: ContextItemType;
  content: string;
}