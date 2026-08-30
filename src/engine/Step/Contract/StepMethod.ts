import type { STEP } from '@engine/Process/ProcessSchema.js';
import {
  STEP_IMPLEMENTATION,
  type iStepImplementation,
  type sStepRequest,
  type tStepImplementation,
  type tStepResult,
} from './StepTsType.js';

/** Imperative Step implementation and escape hatch for behavior that is not declarative yet. */
export abstract class StepMethod<
  TType extends STEP,
  TRequest extends sStepRequest<TType> = sStepRequest<TType>,
  TResult extends tStepResult = tStepResult,
> implements iStepImplementation<TType, TRequest, TResult> {
  public abstract readonly type: TType;
  public abstract getId(): string;
  public abstract run(request: TRequest): Promise<TResult>;

  public getImplementation(): tStepImplementation<TRequest, TResult> {
    return {
      type: STEP_IMPLEMENTATION.METHOD,
      method: this.run.bind(this),
    };
  }
}
