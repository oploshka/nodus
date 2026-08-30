import type { PlanStep } from '@engine/Planner/Deprecated/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import type { WorkerInstrument } from '@engine/Common/Instrument/ProcessInstrument.js';

export interface WorkerRunData {
  task: Task;
  step: PlanStep;
}

export type WorkerResult =
  | { status: 'completed'; summary: string }
  | { status: 'not-completed'; reason: string; canContinue: true }
  | { status: 'failed'; reason: string; canContinue: false };

/** Legacy Engine-facing Worker contract. New Process Worker code must not depend on Deprecated. */
export interface Worker {
  readonly id: string;
  readonly presentation: WorkerPresentation;
  readonly name?: string;
  readonly description: string;
  readonly actions?: ReadonlyArray<{ id: string; presentation: unknown; description: string }>;

  canHandle(step: PlanStep): boolean;
  run(data: WorkerRunData, instrument: WorkerInstrument): Promise<WorkerResult>;
}
