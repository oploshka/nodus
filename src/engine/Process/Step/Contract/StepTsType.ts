import type { STEP } from '@engine/Process/ProcessSchema.js';
import type {
  sProcessExecutionContext,
  sProcessSchema,
  tProcessExecutableStep,
  tProcessModuleResult,
} from '@engine/Process/ProcessTsType.js';

export const STEP_IMPLEMENTATION = {
  SCHEMA: 'SCHEMA',
  METHOD: 'METHOD',
} as const;

export type pStepImplementation = typeof STEP_IMPLEMENTATION[keyof typeof STEP_IMPLEMENTATION];

/** Shared execution request. Role-specific Step contracts may extend it. */
export interface sStepRequest<TType extends STEP = STEP> {
  type: TType;
  task: string;
  context: sProcessExecutionContext;
}

export type tStepResult = tProcessModuleResult;
export type tStepMethod<
  TRequest extends sStepRequest = sStepRequest,
  TResult extends tStepResult = tStepResult,
> = (request: TRequest) => Promise<TResult>;

export type tStepImplementation<
  TRequest extends sStepRequest = sStepRequest,
  TResult extends tStepResult = tStepResult,
> =
  | {
      type: typeof STEP_IMPLEMENTATION.SCHEMA;
      schema: sProcessSchema;
    }
  | {
      type: typeof STEP_IMPLEMENTATION.METHOD;
      method: tStepMethod<TRequest, TResult>;
    };

/** Minimal identity used by deterministic Step resolution. */
export interface iStepIdentity<TType extends STEP = STEP> {
  readonly type: TType;
  getId(): string;
}

/** Common automation-facing execution contract behind semantic Step roles. */
export interface iStepImplementation<
  TType extends STEP = STEP,
  TRequest extends sStepRequest<TType> = sStepRequest<TType>,
  TResult extends tStepResult = tStepResult,
> extends iStepIdentity<TType> {
  getImplementation(): tStepImplementation<TRequest, TResult>;
}

export type tStepRequestedId = (step: tProcessExecutableStep) => string | undefined;
export type tStepRequestFactory<
  TType extends STEP,
  TRequest extends sStepRequest<TType>,
> = (
  step: tProcessExecutableStep,
  context: sProcessExecutionContext,
  task: string,
) => TRequest;
