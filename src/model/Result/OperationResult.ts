// OperationResult.ts
import type { FileChange } from '@core/Change/ChangeSet';

export type OperationStatus = 'continue' | 'waiting' | 'completed' | 'failed';
export type TaskIntent = 'read' | 'write';

export interface ToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
}

export interface StepEvidenceItem {
  path?: string;
  symbol?: string;
  fact: string;
}

export interface StepResult {
  goalSatisfied: boolean;
  findings: string[];
  evidence: StepEvidenceItem[];
  missing: string[];
}

export interface OperationResult {
  status: OperationStatus;
  message?: string;
  finalAnswer?: string;
  nextOperation?: string;
  intent?: TaskIntent;
  toolCalls: ToolCallRequest[];
  changes: FileChange[];
  question?: string;
  observations: string[];
  stepResult?: StepResult;
  data?: unknown;
}
