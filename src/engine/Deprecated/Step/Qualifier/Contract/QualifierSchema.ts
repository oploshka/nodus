import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepSchema } from '@engine/Process/ProcessStepSchema.js';
import type { iQualifierStep, sQualifierRequest, sQualifierSchema, tQualifierResult } from './QualifierTsType.js';

/** QUALIFY-specific declarative Process Step contract. Qualification authority can be defined here later. */
export abstract class QualifierSchema
  extends ProcessStepSchema<STEP.QUALIFY, sQualifierRequest, tQualifierResult>
  implements iQualifierStep {
  public readonly type = STEP.QUALIFY;
  public abstract override getSchema(): sQualifierSchema;
}
