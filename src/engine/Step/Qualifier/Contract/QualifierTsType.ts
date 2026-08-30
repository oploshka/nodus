import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iProcessStepImplementation,
  sProcessStepRequest,
  tProcessStepResult,
} from '@engine/Process/ProcessStepTsType.js';

export interface sQualifierSchema extends sProcessSchema {}
export interface sQualifierRequest extends sProcessStepRequest<STEP.QUALIFY> {}
export type tQualifierResult = tProcessStepResult;
export interface iQualifierStep extends iProcessStepImplementation<STEP.QUALIFY, sQualifierRequest, tQualifierResult> {}
