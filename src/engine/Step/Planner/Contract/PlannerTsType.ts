import { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import type {
  iStepImplementation,
  sStepRequest,
  tStepResult,
} from '../../Contract/StepTsType.js';

export interface sPlannerSchema extends sProcessSchema {}
export interface sPlannerRequest extends sStepRequest<STEP.PLAN> {}
export type tPlannerResult = tStepResult;
export interface iPlannerStep extends iStepImplementation<STEP.PLAN, sPlannerRequest, tPlannerResult> {}
