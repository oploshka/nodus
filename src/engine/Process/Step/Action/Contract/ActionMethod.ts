import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepMethod } from '../../Contract/StepMethod.js';
import type { iActionStep, sActionRequest, tActionResult } from './ActionTsType.js';

/** ACTION-specific imperative Step contract. Direct runtime capabilities can be exposed here later. */
export abstract class ActionMethod
  extends StepMethod<STEP.ACTION, sActionRequest, tActionResult>
  implements iActionStep {
  public readonly type = STEP.ACTION;
}
