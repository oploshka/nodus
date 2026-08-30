import type { STEP } from './ProcessSchema.js';
import type { sProcessSchema } from './ProcessTsType.js';
import {
  PROCESS_STEP_IMPLEMENTATION,
  type iProcessStepImplementation,
  type sProcessStepRequest,
  type tProcessStepImplementation,
  type tProcessStepResult,
} from './ProcessStepTsType.js';

/** Declarative Process Step implementation. Core remains the only Process schema executor. */
export abstract class ProcessStepSchema<
  TType extends STEP,
  TRequest extends sProcessStepRequest<TType> = sProcessStepRequest<TType>,
  TResult extends tProcessStepResult = tProcessStepResult,
> implements iProcessStepImplementation<TType, TRequest, TResult> {
  public abstract readonly type: TType;
  public abstract getId(): string;
  public abstract getSchema(): sProcessSchema;

  public getImplementation(): tProcessStepImplementation<TRequest, TResult> {
    return {
      type: PROCESS_STEP_IMPLEMENTATION.SCHEMA,
      schema: this.getSchema(),
    };
  }
}
