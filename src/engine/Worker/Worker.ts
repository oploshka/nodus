import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';

export type WorkerResult =
  | { status: 'completed'; summary: string }
  | { status: 'not-completed'; reason: string; canContinue: true }
  | { status: 'failed'; reason: string; canContinue: false };

/** Engine-facing contract for one available execution option. */
export interface Worker {
  readonly id: string;
  readonly description: string;
  readonly actions?: ReadonlyArray<{ id: string; description: string }>;

  canHandle(step: PlanStep): boolean;
  run(task: Task, step: PlanStep): Promise<WorkerResult>;
}
