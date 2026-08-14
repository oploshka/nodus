import type { PlanStep } from '@engine/Planner/Plan.js';
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

/** Engine-facing contract for one available execution option. */
export interface Worker {
  readonly id: string;
  /** Presentation owns the human-facing name/color/format; id remains the stable machine key. */
  readonly presentation: WorkerPresentation;
  /** Compatibility alias for callers that still need a plain name. */
  readonly name?: string;
  readonly description: string;
  readonly actions?: ReadonlyArray<{ id: string; presentation: unknown; description: string }>;

  canHandle(step: PlanStep): boolean;
  /**
   * Process data and Engine-owned instruments are separate contracts. Worker only sees the
   * capabilities declared by WorkerInstrument; Engine keeps checkpoint/restore/apply ownership.
   */
  run(data: WorkerRunData, instrument: WorkerInstrument): Promise<WorkerResult>;
}
