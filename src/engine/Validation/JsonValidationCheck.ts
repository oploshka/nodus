import type { Project } from '@engine/Project/Project.js';
import type { ValidationCheck, ValidationCheckResult } from '@engine/Validation/ValidationCheck.js';
import type { ValidationContext } from '@engine/Validation/Validator.js';

/** Validates syntax of changed JSON files against the committed project state. */
export class JsonValidationCheck implements ValidationCheck {
  public readonly id = 'json';

  public constructor(private readonly project: Project) {}

  public async validate(context: ValidationContext): Promise<ValidationCheckResult> {
    const startedAt = performance.now();
    const paths = context.changedPaths.filter((path) => path.toLowerCase().endsWith('.json'));
    if (paths.length === 0) {
      return { id: this.id, status: 'skipped', durationMs: performance.now() - startedAt, reason: 'no changed JSON files' };
    }

    const failures: string[] = [];
    for (const path of paths) {
      try {
        JSON.parse(await this.project.read(path));
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failures.length > 0) {
      return {
        id: this.id,
        status: 'failed',
        durationMs: performance.now() - startedAt,
        reason: 'invalid JSON',
        details: failures,
      };
    }

    return {
      id: this.id,
      status: 'passed',
      durationMs: performance.now() - startedAt,
      details: paths,
    };
  }
}
