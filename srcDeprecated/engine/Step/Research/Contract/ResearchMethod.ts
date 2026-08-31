import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepMethod } from '@engine/Process/ProcessStepMethod.js';
import type { iResearchStep, sResearchRequest, tResearchResult } from './ResearchTsType.js';

/** RESEARCH-specific imperative Process Step contract. Project knowledge capabilities can be exposed here later. */
export abstract class ResearchMethod
  extends ProcessStepMethod<STEP.RESEARCH, sResearchRequest, tResearchResult>
  implements iResearchStep {
  public readonly type = STEP.RESEARCH;
}
