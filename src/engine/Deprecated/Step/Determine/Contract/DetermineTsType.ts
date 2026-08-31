import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iProcessStepImplementation,
  sProcessStepRequest,
  tProcessStepResult,
} from '@engine/Process/ProcessStepTsType.js';

export interface sDetermineSchema extends sProcessSchema {}
export interface sDetermineRequest extends sProcessStepRequest<STEP.DETERMINE> {}
export type tDetermineResult = tProcessStepResult;
export interface iDetermineStep extends iProcessStepImplementation<STEP.DETERMINE, sDetermineRequest, tDetermineResult> {}
