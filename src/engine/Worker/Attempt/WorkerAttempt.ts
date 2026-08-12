import type { PlanStep } from '@engine/Planner/Plan.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { Task } from '@engine/Task/Task.js';

export interface WorkerAttemptContext {
  task: Task;
  step: PlanStep;
  knowledge: ReadonlyArray<ResearchAnswer>;
}

/**
 * Result of one bounded attempt to execute the assigned PlanStep.
 *
 * `missing-information` is not a WorkerResult: it is an internal signal that
 * lets the Worker obtain concrete knowledge and try the same task again.
 */
export type WorkerAttemptResult =
  | { status: 'completed'; summary: string }
  | { status: 'missing-information'; questions: string[]; reason?: string }
  | { status: 'failed'; reason: string };

export interface WorkerAttempt {
  execute(context: WorkerAttemptContext): Promise<WorkerAttemptResult>;
}
