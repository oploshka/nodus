import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepMethod } from '@engine/Process/ProcessStepMethod.js';
import type { iActionStep, sActionRequest, tActionResult } from './ActionTsType.js';

/** ACTION-specific imperative Process Step contract. Direct runtime capabilities can be exposed here later. */
export abstract class ActionMethod
  extends ProcessStepMethod<STEP.ACTION, sActionRequest, tActionResult>
  implements iActionStep {
  public readonly type = STEP.ACTION;
}
