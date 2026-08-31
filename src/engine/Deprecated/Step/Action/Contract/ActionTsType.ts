import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iProcessStepImplementation,
  sProcessStepRequest,
  tProcessStepResult,
} from '@engine/Process/ProcessStepTsType.js';

export interface sActionSchema extends sProcessSchema {}
export interface sActionRequest extends sProcessStepRequest<STEP.ACTION> {
  action: string;
}
export type tActionResult = tProcessStepResult;
export interface iActionStep extends iProcessStepImplementation<STEP.ACTION, sActionRequest, tActionResult> {}
