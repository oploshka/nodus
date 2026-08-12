import type { Task } from '@engine/Task/Task.js';
import type { Plan } from '@engine/Planner/Plan.js';

export interface Planner {
  plan(task: Task): Promise<Plan>;
}
