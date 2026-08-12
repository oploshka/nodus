import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { ActionResult } from '@engine/Worker/Action/ExecutionAction.js';

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
