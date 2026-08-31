import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepMethod } from '@engine/Process/ProcessStepMethod.js';
import type { iDetermineStep, sDetermineRequest, tDetermineResult } from './DetermineTsType.js';

/** DETERMINE-specific imperative Process Step contract. This role remains provisional while its long-term need is evaluated. */
export abstract class DetermineMethod
  extends ProcessStepMethod<STEP.DETERMINE, sDetermineRequest, tDetermineResult>
  implements iDetermineStep {
  public readonly type = STEP.DETERMINE;
}
