import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepSchema } from '@engine/Process/ProcessStepSchema.js';
import type { iWorkerStep, sWorkerRequest, sWorkerSchema, tWorkerResult } from './WorkerTsType.js';

/** WORKER-specific declarative Process Step contract. Worker authority can be added here without duplicating Process mechanics. */
export abstract class WorkerSchema
  extends ProcessStepSchema<STEP.WORKER, sWorkerRequest, tWorkerResult>
  implements iWorkerStep {
  public readonly type = STEP.WORKER;
  public abstract override getSchema(): sWorkerSchema;
}
