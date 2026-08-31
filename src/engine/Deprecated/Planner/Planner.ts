import type { Task } from '@engine/Task/Task.js';
import type { Plan } from './Plan.js';
import type { PlannerPresentation } from '@engine/Presentation/PlannerPresentation.js';

/** Legacy Engine-facing Planner contract. New Process Planner code must not depend on Deprecated. */
export interface Planner {
  readonly presentation: PlannerPresentation;
  plan(task: Task): Promise<Plan>;
}
