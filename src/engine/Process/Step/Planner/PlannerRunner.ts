import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepRunner } from '../StepRunner.js';
import type { iStepResolver } from '../StepResolver.js';
import type { iPlannerStep, sPlannerRequest, tPlannerResult } from './Contract/PlannerTsType.js';

/** PLAN semantic role bound to the shared Step execution mechanism. */
export class PlannerRunner extends StepRunner<STEP.PLAN, sPlannerRequest, tPlannerResult> {
  public constructor(
    planners: ReadonlyArray<iPlannerStep>,
    resolver?: iStepResolver,
  ) {
    super(STEP.PLAN, planners, resolver);
  }
}
