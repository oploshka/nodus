import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iProcessStepImplementation,
  sProcessStepRequest,
  tProcessStepResult,
} from '@engine/Process/ProcessStepTsType.js';

export interface sPlannerSchema extends sProcessSchema {}
export interface sPlannerRequest extends sProcessStepRequest<STEP.PLAN> {}
export type tPlannerResult = tProcessStepResult;
export interface iPlannerStep extends iProcessStepImplementation<STEP.PLAN, sPlannerRequest, tPlannerResult> {}
