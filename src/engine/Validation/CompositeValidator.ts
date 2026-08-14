import { ValidationPresentation } from '@engine/Presentation/ValidationPresentation.js';
import type { ValidationCheck, ValidationCheckResult } from '@engine/Validation/ValidationCheck.js';
import type { ValidationContext, ValidationResult, Validator } from '@engine/Validation/Validator.js';

/** Runs bounded validation checks and aggregates their results without model reasoning. */
export class CompositeValidator implements Validator {
  public readonly presentation = new ValidationPresentation();

  public constructor(private readonly checks: ReadonlyArray<ValidationCheck>) {}

  public async validate(context: ValidationContext): Promise<ValidationResult> {
    const checks: ValidationCheckResult[] = [];

    for (const check of this.checks) {
      checks.push(await check.validate(context));
    }

    const failed = checks.filter((check): check is Extract<ValidationCheckResult, { status: 'failed' }> => check.status === 'failed');
    if (failed.length === 0) return { status: 'passed', checks };

    return {
      status: 'failed',
      reason: failed.map((check) => `${check.id}: ${check.reason}`).join('\n'),
      checks,
    };
  }
}
