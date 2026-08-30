import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepMethod } from '../../Contract/StepMethod.js';
import type { iWorkerStep, sWorkerRequest, tWorkerResult } from './WorkerTsType.js';

/** WORKER-specific imperative Step contract. Runtime capabilities can be exposed here later. */
export abstract class WorkerMethod
  extends StepMethod<STEP.WORKER, sWorkerRequest, tWorkerResult>
  implements iWorkerStep {
  public readonly type = STEP.WORKER;
}
