/**
 * Why Planner kept this outcome as a separate semantic unit.
 *
 * This is planning metadata, not an execution type. Engine/Worker must not use
 * it to choose implementation mechanics.
 */
export type PlanStepDecompositionType =
  | 'coherent-outcome'
  | 'independent-outcome'
  | 'dependency'
  | 'separate-deliverable';

/**
 * A semantic unit of the high-level task plan.
 *
 * PlanStep intentionally describes an outcome, not implementation mechanics.
 * It must not prescribe model calls, files to read, patches to generate, or
 * concrete project APIs unless those details came from the user task itself.
 */
export interface PlanStep {
  /** Stable id inside this Plan. */
  id: string;

  /** What must become true after this semantic unit is handled. */
  goal: string;

  /** User/task constraints that remain relevant while executing this step. */
  constraints: string[];

  /** Why this outcome exists as this semantic planning unit. */
  decompositionType: PlanStepDecompositionType;

  /**
   * Optional project knowledge that may become stale after this step changes
   * the project. This is an invalidation hint, not a request to perform research.
   */
  knowledgeImpact?: string[];
}

export interface Plan {
  steps: PlanStep[];
}
