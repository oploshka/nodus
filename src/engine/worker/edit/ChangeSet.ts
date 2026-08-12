export type UnifiedDiffLine =
  | { type: 'context'; text: string }
  | { type: 'remove'; text: string }
  | { type: 'add'; text: string };

export interface UnifiedDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: UnifiedDiffLine[];
}

export type FileChange =
  | { type: 'write'; path: string; content: string }
  | { type: 'patch'; path: string; hunks: UnifiedDiffHunk[] }
  | { type: 'delete'; path: string };
