import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepSchema } from '../../Contract/StepSchema.js';
import type { iActionStep, sActionRequest, sActionSchema, tActionResult } from './ActionTsType.js';

/** ACTION-specific declarative Step contract. Action delegation rules can be defined here later. */
export abstract class ActionSchema
  extends StepSchema<STEP.ACTION, sActionRequest, tActionResult>
  implements iActionStep {
  public readonly type = STEP.ACTION;
  public abstract override getSchema(): sActionSchema;
}
