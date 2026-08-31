import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepRunner } from '@engine/Process/ProcessStepRunner.js';
import type { iProcessStepResolver } from '@engine/Process/ProcessStepResolver.js';
import type { iQualifierStep, sQualifierRequest, tQualifierResult } from './Contract/QualifierTsType.js';

/** QUALIFY semantic role bound to the shared Process Step execution mechanism. */
export class QualifierRunner extends ProcessStepRunner<STEP.QUALIFY, sQualifierRequest, tQualifierResult> {
  public constructor(
    qualifiers: ReadonlyArray<iQualifierStep>,
    resolver?: iProcessStepResolver,
  ) {
    super(STEP.QUALIFY, qualifiers, resolver);
  }
}
