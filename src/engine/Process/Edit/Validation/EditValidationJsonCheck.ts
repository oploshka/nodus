import type { EditValidationCheck, EditValidationResult} from "@engine/Process/Edit/Validation/EditValidator.js";

/** Strict JSON parse is informational for now: JSON-like example/config files may intentionally contain comments. */
export class EditValidationJsonCheck implements EditValidationCheck {
  public readonly id = 'json';

  public async validate(change: { path: string; content: string }): Promise<EditValidationResult | undefined> {
    if (!change.path.toLowerCase().endsWith('.json')) return undefined;

    try {
      JSON.parse(change.content);
      return { checkId: this.id, path: change.path, status: 'passed' };
    } catch (error) {
      return {
        checkId: this.id,
        path: change.path,
        status: 'warning',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
