import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Presentation } from '@engine/Presentation/Presentation.js';
import type { ValidationPresentationEvent } from '@engine/Presentation/ValidationPresentation.js';
import type { Task } from '@engine/Task/Task.js';
import type { ValidationCheckResult } from '@engine/Validation/ValidationCheck.js';
import type { WorkerResult } from '@engine/Worker/Worker.js';

export interface ValidationContext {
  task: Task;
  step: PlanStep;
  result: WorkerResult;
  /** Canonical project-relative paths committed by Edit for this step. */
  changedPaths: string[];
}

export type ValidationResult =
  | { status: 'passed'; checks: ValidationCheckResult[] }
  | { status: 'failed'; reason: string; checks: ValidationCheckResult[] };

/** Engine-owned boundary for deciding whether a completed Worker result is acceptable. */
export interface Validator {
  readonly presentation: Presentation<ValidationPresentationEvent>;
  validate(context: ValidationContext): Promise<ValidationResult>;
}
