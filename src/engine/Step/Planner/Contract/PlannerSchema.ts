import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepSchema } from '../../Contract/StepSchema.js';
import type { iPlannerStep, sPlannerRequest, sPlannerSchema, tPlannerResult } from './PlannerTsType.js';

/** PLAN-specific declarative Step contract. Planning authority can be defined here later. */
export abstract class PlannerSchema
  extends StepSchema<STEP.PLAN, sPlannerRequest, tPlannerResult>
  implements iPlannerStep {
  public readonly type = STEP.PLAN;
  public abstract override getSchema(): sPlannerSchema;
}
