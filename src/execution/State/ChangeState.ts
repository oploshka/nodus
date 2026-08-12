import type { ToolContextEntry } from '@core/Execution/Execution';
import type { FileChange } from '@execution/State/ChangeSet';
import type { StepEvidenceItem } from '@model/Result/OperationResult';

export type ChangePhase = 'ready' | 'proposed' | 'prepared' | 'validated' | 'completed' | 'failed';

export interface ChangeFact {
  key: string;
  value: string;
  evidence: StepEvidenceItem[];
  producerStepId: string;
}

export interface ChangeRequirement {
  ref: string;
  description: string;
  constraints?: string[];
}

export interface ChangeWorkItem {
  id: string;
  goal: string;
  action?: string;
  subject?: string;
  targetPath: string;
  inputs: string[];
  outputs: string[];
  sourceHints?: string[];
  requirements?: ChangeRequirement[];
  changeDefinition?: string;
  maxAttempts: number;
}

export interface PreparedFileChange {
  change: FileChange;
  path: string;
  originalContent?: string;
  resultingContent?: string;
}

export interface ChangeStateEvent {
  option: string;
  worker: string;
  ok: boolean;
  error?: string;
}

export interface ChangeState {
  readonly work: ChangeWorkItem;
  readonly facts: ChangeFact[];
  phase: ChangePhase;
  attempt: number;
  retryReason?: string;
  lastError?: string;
  proposal?: FileChange[];
  prepared?: PreparedFileChange[];
  authoritativeSource?: string;
  targetContext?: ToolContextEntry[];
  history: ChangeStateEvent[];
}

export function createChangeState(work: ChangeWorkItem, facts: ChangeFact[]): ChangeState {
  return {
    work,
    facts,
    phase: 'ready',
    attempt: 0,
    history: [],
  };
}

export function resetChangeForRetry(state: ChangeState, error: string): ChangeState {
  return {
    ...state,
    phase: 'ready',
    retryReason: `edit proposal rejected before commit: ${error}`,
    lastError: error,
    proposal: undefined,
    prepared: undefined,
  };
}
