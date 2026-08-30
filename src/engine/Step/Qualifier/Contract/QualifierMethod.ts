import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepMethod } from '@engine/Process/ProcessStepMethod.js';
import type { iQualifierStep, sQualifierRequest, tQualifierResult } from './QualifierTsType.js';

/** QUALIFY-specific imperative Process Step contract. Qualification capabilities can be exposed here later. */
export abstract class QualifierMethod
  extends ProcessStepMethod<STEP.QUALIFY, sQualifierRequest, tQualifierResult>
  implements iQualifierStep {
  public readonly type = STEP.QUALIFY;
}
