import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepRunner } from '@engine/Process/ProcessStepRunner.js';
import type { iProcessStepResolver } from '@engine/Process/ProcessStepResolver.js';
import type { iWorkerStep, sWorkerRequest, tWorkerResult } from './Contract/WorkerTsType.js';

/** WORKER semantic role bound to the shared Process Step execution mechanism. */
export class WorkerRunner extends ProcessStepRunner<STEP.WORKER, sWorkerRequest, tWorkerResult> {
  public constructor(
    workers: ReadonlyArray<iWorkerStep>,
    resolver?: iProcessStepResolver,
  ) {
    super(STEP.WORKER, workers, resolver);
  }
}
