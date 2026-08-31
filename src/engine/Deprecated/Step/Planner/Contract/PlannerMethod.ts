import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepMethod } from '@engine/Process/ProcessStepMethod.js';
import type { iPlannerStep, sPlannerRequest, tPlannerResult } from './PlannerTsType.js';

/** PLAN-specific imperative Process Step contract. Planner capabilities can be exposed here later. */
export abstract class PlannerMethod
  extends ProcessStepMethod<STEP.PLAN, sPlannerRequest, tPlannerResult>
  implements iPlannerStep {
  public readonly type = STEP.PLAN;
}
