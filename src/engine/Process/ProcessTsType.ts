import { MODULE_RESULT, STEP } from './ProcessSchema.js';
import type { StepRef } from './StepRef.js';

export type pProcessStatus = 'SUCCESS' | 'FAILURE';

export interface sProcessInputContext {
  parent?: boolean;
  previous?: boolean;
  steps?: number[];
}

export interface sProcessInput {
  context?: sProcessInputContext;
}

export interface sProcessOutput {
  status: pProcessStatus;
  value?: unknown;
  reason?: string;
}

export type tProcessTransition = (plan: sProcessSequence, step: number) => void;

export interface sProcessStepBase {
  task?: string;
  preset?: string;
  input?: sProcessInput;
  output?: sProcessOutput;
  transition?: tProcessTransition;
}

export interface sProcessSequence extends sProcessStepBase {
  type: STEP.SEQUENCE;
  steps: tProcessStep[];
}

export interface sProcessExecutableStepBase extends sProcessStepBase {
  schema?: sProcessSequence;
}

export interface sProcessAction extends sProcessExecutableStepBase {
  type: STEP.ACTION;
  action: string;
}

export interface sProcessModuleStep extends sProcessExecutableStepBase {
  type: STEP.QUALIFY | STEP.PLAN | STEP.WORKER | STEP.VALIDATE | STEP.REPLAN;
}

export type tProcessExecutableStep = sProcessAction | sProcessModuleStep;
export type tProcessStep = sProcessSequence | tProcessExecutableStep;
export interface sProcessSchema extends sProcessSequence {}

export interface sProcessExecutionContext {
  parent?: unknown;
  previous?: sProcessOutput;
  steps: ReadonlyArray<StepRef>;
  step: number;
  path: ReadonlyArray<number>;
}

export interface sProcessModuleOutputResult {
  type: MODULE_RESULT.OUTPUT;
  output: sProcessOutput;
}

export interface sProcessModuleSchemaResult {
  type: MODULE_RESULT.SCHEMA;
  schema: sProcessSequence;
}

export type tProcessModuleResult = sProcessModuleOutputResult | sProcessModuleSchemaResult;

export interface iProcessModule {
  readonly type: STEP;
  execute(step: tProcessExecutableStep, context: sProcessExecutionContext): Promise<tProcessModuleResult>;
}

export interface sProcessTraceEntry {
  path: ReadonlyArray<number>;
  type: STEP;
  status: 'STARTED' | pProcessStatus;
}

export interface sProcessRunResult {
  status: pProcessStatus;
  output?: sProcessOutput;
  schema: sProcessSchema;
  trace: ReadonlyArray<sProcessTraceEntry>;
  reason?: string;
}
