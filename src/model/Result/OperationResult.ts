// OperationResult.ts
import type { FileChange } from '@core/Change/ChangeSet';

export type OperationStatus = 'continue' | 'waiting' | 'completed' | 'failed';

export interface ToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
}

export interface OperationResult {
  status: OperationStatus;
  message?: string;
  nextOperation?: string;
  toolCalls: ToolCallRequest[];
  changes: FileChange[];
  question?: string;
  observations: string[];
  data?: unknown;
}
