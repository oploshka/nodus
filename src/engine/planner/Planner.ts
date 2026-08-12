import type { Task } from '../task/Task.js';
import type { Plan } from './Plan.js';

export interface Planner {
  plan(task: Task): Promise<Plan>;
}
