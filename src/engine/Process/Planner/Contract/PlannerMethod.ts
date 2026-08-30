import {
  PLANNER_IMPLEMENTATION,
  type iPlannerModule,
  type sPlannerRequest,
  type tPlannerImplementation,
  type tPlannerResult,
} from './PlannerTsType.js';

/** Base class for automation Planners implemented by custom JavaScript/TypeScript logic. */
export abstract class PlannerMethod implements iPlannerModule {
  public abstract getId(): string;
  public abstract run(request: sPlannerRequest): Promise<tPlannerResult>;

  public getImplementation(): tPlannerImplementation {
    return {
      type: PLANNER_IMPLEMENTATION.METHOD,
      method: this.run.bind(this),
    };
  }
}
