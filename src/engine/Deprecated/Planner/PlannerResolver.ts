import type { iProcessPlanner } from './PlannerTsType.js';

export interface iPlannerResolver {
  resolve(task: string, planners: ReadonlyArray<iProcessPlanner>): iProcessPlanner;
}

export class PlannerResolver implements iPlannerResolver {
  public resolve(_task: string, planners: ReadonlyArray<iProcessPlanner>): iProcessPlanner {
    if (planners.length === 0) throw new Error('PlannerResolver requires one planner.');
    if (planners.length > 1) throw new Error('PlannerResolver cannot choose between multiple planners yet.');

    const planner = planners[0];
    if (!planner) throw new Error('PlannerResolver requires one planner.');
    return planner;
  }
}
