import type { ValidationContext } from '@engine/Validation/Validator.js';

export type ValidationCheckResult =
  | { id: string; status: 'passed'; durationMs: number; details?: string[] }
  | { id: string; status: 'skipped'; durationMs: number; reason?: string }
  | { id: string; status: 'failed'; durationMs: number; reason: string; details?: string[] };

/** One bounded validation mechanism. Multiple checks can be composed by a Validator. */
export interface ValidationCheck {
  readonly id: string;
  validate(context: ValidationContext): Promise<ValidationCheckResult>;
}
