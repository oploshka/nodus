import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepSchema } from '@engine/Process/ProcessStepSchema.js';
import type { iActionStep, sActionRequest, sActionSchema, tActionResult } from './ActionTsType.js';

/** ACTION-specific declarative Process Step contract. Action delegation rules can be defined here later. */
export abstract class ActionSchema
  extends ProcessStepSchema<STEP.ACTION, sActionRequest, tActionResult>
  implements iActionStep {
  public readonly type = STEP.ACTION;
  public abstract override getSchema(): sActionSchema;
}
