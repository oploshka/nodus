import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import type { ProjectEditor } from '@engine/Edit/ProjectEditor.js';

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
   * Edit is a task-local Engine tool. Workers may use it during execution, but Engine keeps
   * ownership of checkpoint/restore/apply. The interface can be narrowed later when usage stabilizes.
   */
  run(task: Task, step: PlanStep, edit: ProjectEditor): Promise<WorkerResult>;
}
