import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iStepImplementation,
  sStepRequest,
  tStepResult,
} from '../../Contract/StepTsType.js';

export interface sWorkerSchema extends sProcessSchema {}
export interface sWorkerRequest extends sStepRequest<STEP.WORKER> {}
export type tWorkerResult = tStepResult;
export interface iWorkerStep extends iStepImplementation<STEP.WORKER, sWorkerRequest, tWorkerResult> {}
