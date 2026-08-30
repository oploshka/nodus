import { MODULE_RESULT, STEP } from '@engine/Process/ProcessSchema.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  tProcessExecutableStep,
  tProcessModuleResult,
} from '@engine/Process/ProcessTsType.js';
import {
  PLANNER_IMPLEMENTATION,
  type iPlannerModule,
  type pPlannerOperation,
  type sPlannerRequest,
} from './Contract/PlannerTsType.js';
import { PlannerResolver, type iPlannerResolver } from './PlannerResolver.js';

/** Process adapter for automation Planners. Qualification is a separate Process concern. */
export class PlannerRunner implements iProcessModule {
  public readonly type: pPlannerOperation;

  public constructor(
    type: pPlannerOperation,
    public readonly planners: ReadonlyArray<iPlannerModule>,
    private readonly resolver: iPlannerResolver = new PlannerResolver(),
  ) {
    this.type = type;
  }

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    if (this.type !== STEP.PLAN && this.type !== STEP.REPLAN) {
      throw new Error(`PlannerRunner cannot execute ${String(this.type)}.`);
    }

    const task = step.task ?? context.parent;
    if (typeof task !== 'string' || task.trim().length === 0) {
      throw new Error(`${this.type} requires a non-empty self-contained task.`);
    }

    const planner = this.resolver.resolve(step.preset, this.planners);
    const request: sPlannerRequest = {
      operation: this.type,
      task,
      context,
    };
    const implementation = planner.getImplementation();

    switch (implementation.type) {
      case PLANNER_IMPLEMENTATION.SCHEMA:
        return {
          type: MODULE_RESULT.SCHEMA,
          schema: implementation.schema,
        };

      case PLANNER_IMPLEMENTATION.METHOD:
        return implementation.method(request);
    }
  }
}
