import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepRunner } from '@engine/Process/ProcessStepRunner.js';
import type { iProcessStepResolver } from '@engine/Process/ProcessStepResolver.js';
import type { iDetermineStep, sDetermineRequest, tDetermineResult } from './Contract/DetermineTsType.js';

/** DETERMINE semantic role bound to the shared Process Step execution mechanism. */
export class DetermineRunner extends ProcessStepRunner<STEP.DETERMINE, sDetermineRequest, tDetermineResult> {
  public constructor(
    determines: ReadonlyArray<iDetermineStep>,
    resolver?: iProcessStepResolver,
  ) {
    super(STEP.DETERMINE, determines, resolver);
  }
}
