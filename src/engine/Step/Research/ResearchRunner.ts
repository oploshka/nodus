import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepRunner } from '@engine/Process/ProcessStepRunner.js';
import type { iProcessStepResolver } from '@engine/Process/ProcessStepResolver.js';
import type { iResearchStep, sResearchRequest, tResearchResult } from './Contract/ResearchTsType.js';

/** RESEARCH semantic role bound to the shared Process Step execution mechanism. */
export class ResearchRunner extends ProcessStepRunner<STEP.RESEARCH, sResearchRequest, tResearchResult> {
  public constructor(
    researchers: ReadonlyArray<iResearchStep>,
    resolver?: iProcessStepResolver,
  ) {
    super(STEP.RESEARCH, researchers, resolver);
  }
}
