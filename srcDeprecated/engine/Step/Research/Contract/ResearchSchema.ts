import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepSchema } from '@engine/Process/ProcessStepSchema.js';
import type { iResearchStep, sResearchRequest, sResearchSchema, tResearchResult } from './ResearchTsType.js';

/** RESEARCH-specific declarative Process Step contract. */
export abstract class ResearchSchema
  extends ProcessStepSchema<STEP.RESEARCH, sResearchRequest, tResearchResult>
  implements iResearchStep {
  public readonly type = STEP.RESEARCH;
  public abstract override getSchema(): sResearchSchema;
}
