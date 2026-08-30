import { STEP } from '@engine/Process/ProcessSchema.js';
import { StepSchema } from '../../Contract/StepSchema.js';
import type { iWorkerStep, sWorkerRequest, sWorkerSchema, tWorkerResult } from './WorkerTsType.js';

/** WORKER-specific declarative Step contract. Worker authority can be added here without duplicating Step mechanics. */
export abstract class WorkerSchema
  extends StepSchema<STEP.WORKER, sWorkerRequest, tWorkerResult>
  implements iWorkerStep {
  public readonly type = STEP.WORKER;
  public abstract override getSchema(): sWorkerSchema;
}
