export enum STEP {
  SEQUENCE = 'SEQUENCE',
  QUALIFY = 'QUALIFY',
  PLAN = 'PLAN',
  WORKER = 'WORKER',
  ACTION = 'ACTION',
  VALIDATE = 'VALIDATE',
  REPLAN = 'REPLAN',
}

export enum ACTION {
  ASK_USER = 'ASK_USER',
}

export enum TASK_TYPE {
  SIMPLE = 'SIMPLE',
  MULTI = 'MULTI',
  PROCESS = 'PROCESS',
}

export type pProcessStatus = 'SUCCESS' | 'FAILURE';

export interface sProcessInputContext {
  parent?: boolean;
  previous?: boolean;
  /** One-based step numbers inside the current local sequence. */
  steps?: number[];
}

export interface sProcessInput {
  context?: sProcessInputContext;
}

/**
 * The execution result lives next to the step that produced it.
 * More fields (usage, request metadata, timing, etc.) can be added later
 * without introducing a separate step state object.
 */
export interface sProcessOutput {
  status: pProcessStatus;
  value?: unknown;
  reason?: string;
}

export type tProcessTransition = (plan: sProcessSequence, step: number) => void;

export interface sProcessStepBase {
  /** Self-contained semantic task for this step when one is needed. */
  task?: string;
  preset?: string;
  input?: sProcessInput;
  output?: sProcessOutput;
  /**
   * Runs after this step. Receives only the current local sequence and the
   * one-based number of the completed step. It may rewrite only the tail.
   */
  transition?: tProcessTransition;
}

export interface sProcessSequence extends sProcessStepBase {
  type: STEP.SEQUENCE;
  steps: tProcessStep[];
}

export interface sProcessAction extends sProcessStepBase {
  type: STEP.ACTION;
  action: ACTION;
}

export interface sProcessModuleStep extends sProcessStepBase {
  type: STEP.QUALIFY | STEP.PLAN | STEP.WORKER | STEP.VALIDATE | STEP.REPLAN;
}

export type tProcessExecutableStep = sProcessAction | sProcessModuleStep;
export type tProcessStep = sProcessSequence | tProcessExecutableStep;
export interface sProcessSchema extends sProcessSequence {}

export interface sProcessExecutionContext {
  /** Full input of the immediate parent sequence when requested. */
  parent?: unknown;
  /** Full output of the immediately previous local step when requested. */
  previous?: sProcessOutput;
  /** Full outputs of selected already executed local steps. */
  steps: Readonly<Record<number, sProcessOutput>>;
  /** One-based number inside the current local sequence. */
  step: number;
  /** Runtime path is for trace/debugging only; models should not address it. */
  path: ReadonlyArray<number>;
}

export interface iProcessModule {
  readonly type: STEP;
  execute(step: tProcessExecutableStep, context: sProcessExecutionContext): Promise<sProcessOutput>;
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
