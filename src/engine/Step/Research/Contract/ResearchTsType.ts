import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iProcessStepImplementation,
  sProcessStepRequest,
  tProcessStepResult,
} from '@engine/Process/ProcessStepTsType.js';

export interface sResearchSchema extends sProcessSchema {}
export interface sResearchRequest extends sProcessStepRequest<STEP.RESEARCH> {}
export type tResearchResult = tProcessStepResult;
export interface iResearchStep extends iProcessStepImplementation<STEP.RESEARCH, sResearchRequest, tResearchResult> {}
