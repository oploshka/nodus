import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepSchema } from '@engine/Process/ProcessStepSchema.js';
import type { iDetermineStep, sDetermineRequest, sDetermineSchema, tDetermineResult } from './DetermineTsType.js';

/** DETERMINE-specific declarative Process Step contract. */
export abstract class DetermineSchema
  extends ProcessStepSchema<STEP.DETERMINE, sDetermineRequest, tDetermineResult>
  implements iDetermineStep {
  public readonly type = STEP.DETERMINE;
  public abstract override getSchema(): sDetermineSchema;
}
