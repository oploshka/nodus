import { STEP } from '@engine/Process/ProcessSchema.js';
import type {
  sProcessExecutionContext,
  sProcessSchema,
  tProcessModuleResult,
} from '@engine/Process/ProcessTsType.js';

export const PLANNER_IMPLEMENTATION = {
  SCHEMA: 'SCHEMA',
  METHOD: 'METHOD',
} as const;

export type pPlannerImplementation = typeof PLANNER_IMPLEMENTATION[keyof typeof PLANNER_IMPLEMENTATION];
export type pPlannerOperation = STEP.PLAN | STEP.REPLAN;

/** A Planner-owned local Process schema. Core remains the only schema executor. */
export interface sPlannerSchema extends sProcessSchema {}

export interface sPlannerRequest {
  operation: pPlannerOperation;
  task: string;
  context: sProcessExecutionContext;
}

export type tPlannerResult = tProcessModuleResult;
export type tPlannerMethod = (request: sPlannerRequest) => Promise<tPlannerResult>;

export type tPlannerImplementation =
  | {
      type: typeof PLANNER_IMPLEMENTATION.SCHEMA;
      schema: sPlannerSchema;
    }
  | {
      type: typeof PLANNER_IMPLEMENTATION.METHOD;
      method: tPlannerMethod;
    };

/** Automation-facing Planner contract. Qualification is intentionally not part of Planner. */
export interface iPlannerModule {
  getId(): string;
  getImplementation(): tPlannerImplementation;
}
