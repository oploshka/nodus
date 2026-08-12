import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { ExecutionState } from '@engine/Worker/ExecutionState.js';

export type WorkerResult =
  | { status: 'completed'; summary: string; state: ExecutionState }
  | { status: 'needs-subtask'; task: string; reason?: string; state: ExecutionState }
  | { status: 'blocked'; reason: string; state: ExecutionState }
  | { status: 'failed'; error: string; state: ExecutionState };

/** Engine-facing contract for one available execution option. */
export interface Worker {
  readonly id: string;
  readonly description: string;

  canHandle(step: PlanStep): boolean;
  run(task: Task, step: PlanStep): Promise<WorkerResult>;
}
