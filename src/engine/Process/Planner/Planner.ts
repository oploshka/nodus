import type { Task } from '@engine/Task/Task.js';
import type { Plan } from '@engine/Planner/Plan.js';
import type { PlannerPresentation } from '@engine/Presentation/PlannerPresentation.js';

export interface Planner {
  readonly presentation: PlannerPresentation;
  plan(task: Task): Promise<Plan>;
}
