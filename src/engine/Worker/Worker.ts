import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { ExecutionState } from '@engine/Worker/ExecutionState.js';

export type WorkerResult =
  | { status: 'completed'; summary: string; state: ExecutionState }
  | { status: 'failed'; error: string; state: ExecutionState };

/**
 * Engine-facing Worker contract. Engine treats workers as execution options and
 * only cares whether a worker can handle a PlanStep and what status it returns.
 */
export interface Worker {
  readonly id: string;
  readonly description: string;

  canHandle(step: PlanStep): boolean;
  run(task: Task, step: PlanStep): Promise<WorkerResult>;
}
