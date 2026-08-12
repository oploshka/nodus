// OperationResult.ts
import type { FileChange } from '@execution/State/ChangeSet';

export type OperationStatus = 'continue' | 'waiting' | 'completed' | 'failed';
export type TaskIntent = 'read' | 'write';
export type RetrievalMatch = 'exact' | 'related' | 'missing';

export interface ToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
}

export interface StepEvidenceItem {
  path?: string;
  symbol?: string;
  fact: string;
}

export interface StepFact {
  key: string;
  value: string;
  evidence: StepEvidenceItem[];
}

export interface RetrievalAssessment {
  match: RetrievalMatch;
  requirement?: string;
  reason: string;
}

export interface StepResult {
  goalSatisfied: boolean;
  targets?: string[];
  findings: string[];
  evidence: StepEvidenceItem[];
  missing: string[];
  facts: StepFact[];
  retrieval?: RetrievalAssessment;
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
