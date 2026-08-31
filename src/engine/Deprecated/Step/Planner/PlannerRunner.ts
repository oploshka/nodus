import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepRunner } from '@engine/Process/ProcessStepRunner.js';
import type { iProcessStepResolver } from '@engine/Process/ProcessStepResolver.js';
import type { iPlannerStep, sPlannerRequest, tPlannerResult } from './Contract/PlannerTsType.js';

/** PLAN semantic role bound to the shared Process Step execution mechanism. */
export class PlannerRunner extends ProcessStepRunner<STEP.PLAN, sPlannerRequest, tPlannerResult> {
  public constructor(
    planners: ReadonlyArray<iPlannerStep>,
    resolver?: iProcessStepResolver,
  ) {
    super(STEP.PLAN, planners, resolver);
  }
}
