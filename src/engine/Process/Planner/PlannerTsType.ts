import type {
  sProcessExecutionContext,
  sProcessOutput,
  tProcessStep,
} from '../ProcessTsType.js';

export interface sProcessPlanningRequest {
  task: string;
  qualification: string;
  context: sProcessExecutionContext;
}

export interface sProcessReplanningRequest {
  task: string;
  failure: sProcessOutput;
  context: sProcessExecutionContext;
}

export interface iProcessPlanner {
  qualify(task: string, context: sProcessExecutionContext): Promise<string>;
  plan(request: sProcessPlanningRequest): Promise<tProcessStep[]>;
  replan(request: sProcessReplanningRequest): Promise<tProcessStep[]>;
}
