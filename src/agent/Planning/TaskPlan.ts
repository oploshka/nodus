// TaskPlan.ts
export type PlanStepType = 'search' | 'understand' | 'prepare-change' | 'edit-file' | 'review' | 'verify' | 'finalize';
export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed';
export type FactKey = string;

export type PlanStepAction =
  | 'find-files'
  | 'find-symbols'
  | 'find-definitions'
  | 'find-usages'
  | 'find-references'
  | 'find-examples'
  | 'explain-relationship'
  | 'trace-data-flow'
  | 'identify-source'
  | 'identify-pattern'
  | 'determine-integration'
  | 'define-change'
  | 'select-targets'
  | 'apply-change'
  | 'review-change'
  | 'run-checks'
  | 'summarize-result';

export interface PlanStep {
  id: string;
  type: PlanStepType;
  action?: PlanStepAction;
  subject?: string;
  goal: string;
  status: PlanStepStatus;
  maxAttempts: number;
  inputs: FactKey[];
  outputs: FactKey[];
  targetPath?: string;
  sourceHints?: string[];
  recoveryForStepId?: string;
}

export interface TaskPlan {
  version: number;
  goal: string;
  steps: PlanStep[];
}

export const PLAN_STEP_LIMITS: Record<PlanStepType, number> = {
  search: 1,
  understand: 2,
  'prepare-change': 1,
  'edit-file': 3,
  review: 1,
  verify: 1,
  finalize: 1,
};
