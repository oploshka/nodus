import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepMethod } from '@engine/Process/ProcessStepMethod.js';
import type { iWorkerStep, sWorkerRequest, tWorkerResult } from './WorkerTsType.js';

/** WORKER-specific imperative Process Step contract. Runtime capabilities can be exposed here later. */
export abstract class WorkerMethod
  extends ProcessStepMethod<STEP.WORKER, sWorkerRequest, tWorkerResult>
  implements iWorkerStep {
  public readonly type = STEP.WORKER;
}
