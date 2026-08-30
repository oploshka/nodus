import {
  PLANNER_IMPLEMENTATION,
  type iPlannerModule,
  type sPlannerSchema,
  type tPlannerImplementation,
} from './PlannerTsType.js';

/** Base class for automation Planners whose implementation is expressed as a local Process schema. */
export abstract class PlannerSchema implements iPlannerModule {
  public abstract getId(): string;
  public abstract getSchema(): sPlannerSchema;

  public getImplementation(): tPlannerImplementation {
    return {
      type: PLANNER_IMPLEMENTATION.SCHEMA,
      schema: this.getSchema(),
    };
  }
}
