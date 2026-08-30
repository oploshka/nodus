import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepSchema } from '@engine/Process/ProcessStepSchema.js';
import type { iPlannerStep, sPlannerRequest, sPlannerSchema, tPlannerResult } from './PlannerTsType.js';

/** PLAN-specific declarative Process Step contract. Planning authority can be defined here later. */
export abstract class PlannerSchema
  extends ProcessStepSchema<STEP.PLAN, sPlannerRequest, tPlannerResult>
  implements iPlannerStep {
  public readonly type = STEP.PLAN;
  public abstract override getSchema(): sPlannerSchema;
}
