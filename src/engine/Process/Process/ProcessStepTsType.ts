import type { STEP } from './ProcessSchema.js';
import type {
  sProcessExecutionContext,
  sProcessSchema,
  tProcessExecutableStep,
  tProcessModuleResult,
} from './ProcessTsType.js';

export const PROCESS_STEP_IMPLEMENTATION = {
  SCHEMA: 'SCHEMA',
  METHOD: 'METHOD',
} as const;

export type pProcessStepImplementation = typeof PROCESS_STEP_IMPLEMENTATION[keyof typeof PROCESS_STEP_IMPLEMENTATION];

/** Shared execution request behind one semantic Process Step role. */
export interface sProcessStepRequest<TType extends STEP = STEP> {
  type: TType;
  task: string;
  context: sProcessExecutionContext;
}

export type tProcessStepResult = tProcessModuleResult;
export type tProcessStepMethod<
  TRequest extends sProcessStepRequest = sProcessStepRequest,
  TResult extends tProcessStepResult = tProcessStepResult,
> = (request: TRequest) => Promise<TResult>;

export type tProcessStepImplementation<
  TRequest extends sProcessStepRequest = sProcessStepRequest,
  TResult extends tProcessStepResult = tProcessStepResult,
> =
  | {
      type: typeof PROCESS_STEP_IMPLEMENTATION.SCHEMA;
      schema: sProcessSchema;
    }
  | {
      type: typeof PROCESS_STEP_IMPLEMENTATION.METHOD;
      method: tProcessStepMethod<TRequest, TResult>;
    };

/** Minimal identity used by deterministic Process Step resolution. */
export interface iProcessStepIdentity<TType extends STEP = STEP> {
  readonly type: TType;
  getId(): string;
}

/** Common automation-facing execution contract behind semantic Process Step roles. */
export interface iProcessStepImplementation<
  TType extends STEP = STEP,
  TRequest extends sProcessStepRequest<TType> = sProcessStepRequest<TType>,
  TResult extends tProcessStepResult = tProcessStepResult,
> extends iProcessStepIdentity<TType> {
  getImplementation(): tProcessStepImplementation<TRequest, TResult>;
}

export type tProcessStepRequestedId = (step: tProcessExecutableStep) => string | undefined;
export type tProcessStepRequestFactory<
  TType extends STEP,
  TRequest extends sProcessStepRequest<TType>,
> = (
  step: tProcessExecutableStep,
  context: sProcessExecutionContext,
  task: string,
) => TRequest;
