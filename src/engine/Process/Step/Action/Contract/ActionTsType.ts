import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iStepImplementation,
  sStepRequest,
  tStepResult,
} from '../../Contract/StepTsType.js';

export interface sActionSchema extends sProcessSchema {}
export interface sActionRequest extends sStepRequest<STEP.ACTION> {
  action: string;
}
export type tActionResult = tStepResult;
export interface iActionStep extends iStepImplementation<STEP.ACTION, sActionRequest, tActionResult> {}
