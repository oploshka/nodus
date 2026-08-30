import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepMethod } from '../../Contract/StepMethod.js';
import type { iPlannerStep, sPlannerRequest, tPlannerResult } from './PlannerTsType.js';

/** PLAN-specific imperative Step contract. Planner capabilities can be exposed here later. */
export abstract class PlannerMethod
  extends StepMethod<STEP.PLAN, sPlannerRequest, tPlannerResult>
  implements iPlannerStep {
  public readonly type = STEP.PLAN;
}
