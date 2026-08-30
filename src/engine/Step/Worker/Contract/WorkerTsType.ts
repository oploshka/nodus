import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iProcessStepImplementation,
  sProcessStepRequest,
  tProcessStepResult,
} from '@engine/Process/ProcessStepTsType.js';

export interface sWorkerSchema extends sProcessSchema {}
export interface sWorkerRequest extends sProcessStepRequest<STEP.WORKER> {}
export type tWorkerResult = tProcessStepResult;
export interface iWorkerStep extends iProcessStepImplementation<STEP.WORKER, sWorkerRequest, tWorkerResult> {}
