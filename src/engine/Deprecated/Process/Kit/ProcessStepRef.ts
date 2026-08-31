import type { sProcessOutput, tProcessStep } from '../ProcessTsType.js';

/** Runtime-only stable link from a local model-facing step number to the actual step object. */
export class ProcessStepRef {
  public constructor(
    public readonly number: number,
    private readonly target: tProcessStep,
  ) {}

  public get output(): sProcessOutput {
    const output = this.target.output;
    if (!output) throw new Error(`Local step ${this.number} has no output.`);
    return output;
  }
}
