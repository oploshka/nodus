export interface EditCandidate {
  path: string;
  content: string;
}

export type EditValidationResult =
  | { checkId: string; path: string; status: 'passed' }
  | { checkId: string; path: string; status: 'warning'; reason: string }
  | { checkId: string; path: string; status: 'failed'; reason: string };

export interface EditValidationCheck {
  readonly id: string;
  validate(change: EditCandidate): Promise<EditValidationResult | undefined>;
}

/** Validates a prepared batch before it becomes part of accumulated Edit state. */
export class EditValidator {
  public constructor(private readonly checks: ReadonlyArray<EditValidationCheck> = []) {}

  public async validate(changes: ReadonlyArray<EditCandidate>): Promise<EditValidationResult[]> {
    const results: EditValidationResult[] = [];

    for (const change of changes) {
      for (const check of this.checks) {
        const result = await check.validate(change);
        if (result) results.push(result);
      }
    }

    return results;
  }
}
