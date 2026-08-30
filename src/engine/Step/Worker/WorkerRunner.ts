import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepRunner } from '../StepRunner.js';
import type { iStepResolver } from '../StepResolver.js';
import type { iWorkerStep, sWorkerRequest, tWorkerResult } from './Contract/WorkerTsType.js';

/** WORKER semantic role bound to the shared Step execution mechanism. */
export class WorkerRunner extends StepRunner<STEP.WORKER, sWorkerRequest, tWorkerResult> {
  public constructor(
    workers: ReadonlyArray<iWorkerStep>,
    resolver?: iStepResolver,
  ) {
    super(STEP.WORKER, workers, resolver);
  }
}
