// TaskPlan.ts
export type PlanStepType = 'search' | 'understand' | 'prepare-change' | 'edit-file' | 'review' | 'verify' | 'finalize';
export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed';
export type FactKey = string;

export interface PlanStep {
  id: string;
  type: PlanStepType;
  goal: string;
  status: PlanStepStatus;
  maxAttempts: number;
  inputs: FactKey[];
  outputs: FactKey[];
  targetPath?: string;
  recoveryForStepId?: string;
}

export interface TaskPlan {
  version: number;
  goal: string;
  steps: PlanStep[];
}

export const PLAN_STEP_LIMITS: Record<PlanStepType, number> = {
  search: 3,
  understand: 2,
  'prepare-change': 1,
  'edit-file': 3,
  review: 1,
  verify: 1,
  finalize: 1,
};
