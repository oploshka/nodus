import type { STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessSchema } from '@engine/Process/ProcessTsType.js';
import {
  STEP_IMPLEMENTATION,
  type iStepImplementation,
  type sStepRequest,
  type tStepImplementation,
  type tStepResult,
} from './StepTsType.js';

/** Declarative Step implementation. Core remains the only Process schema executor. */
export abstract class StepSchema<
  TType extends STEP,
  TRequest extends sStepRequest<TType> = sStepRequest<TType>,
  TResult extends tStepResult = tStepResult,
> implements iStepImplementation<TType, TRequest, TResult> {
  public abstract readonly type: TType;
  public abstract getId(): string;
  public abstract getSchema(): sProcessSchema;

  public getImplementation(): tStepImplementation<TRequest, TResult> {
    return {
      type: STEP_IMPLEMENTATION.SCHEMA,
      schema: this.getSchema(),
    };
  }
}
