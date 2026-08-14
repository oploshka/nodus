import { ValidationPresentation } from '@engine/Presentation/ValidationPresentation.js';
import type { ValidationContext, ValidationResult, Validator } from '@engine/Validation/Validator.js';

/** Compatibility validator for tests/overrides that intentionally accepts every completed result. */
export class PassValidator implements Validator {
  public readonly presentation = new ValidationPresentation();

  public async validate(_context: ValidationContext): Promise<ValidationResult> {
    return { status: 'passed', checks: [] };
  }
}
