import type { PlanStep } from '../planner/Plan.js';
import type { Task } from '../task/Task.js';
import type { ActionResult } from './action/ExecutionAction.js';

export interface ExecutionHistoryEntry {
  actionId: string;
  input: unknown;
  result: ActionResult;
}

export interface ExecutionState {
  task: Task;
  step: PlanStep;
  iteration: number;
  history: ExecutionHistoryEntry[];
}

export function createExecutionState(task: Task, step: PlanStep): ExecutionState {
  return { task, step, iteration: 0, history: [] };
}
