import type { STEP } from './ProcessSchema.js';
import {
  PROCESS_STEP_IMPLEMENTATION,
  type iProcessStepImplementation,
  type sProcessStepRequest,
  type tProcessStepImplementation,
  type tProcessStepResult,
} from './ProcessStepTsType.js';

/** Imperative Process Step implementation and escape hatch for behavior that is not declarative yet. */
export abstract class ProcessStepMethod<
  TType extends STEP,
  TRequest extends sProcessStepRequest<TType> = sProcessStepRequest<TType>,
  TResult extends tProcessStepResult = tProcessStepResult,
> implements iProcessStepImplementation<TType, TRequest, TResult> {
  public abstract readonly type: TType;
  public abstract getId(): string;
  public abstract run(request: TRequest): Promise<TResult>;

  public getImplementation(): tProcessStepImplementation<TRequest, TResult> {
    return {
      type: PROCESS_STEP_IMPLEMENTATION.METHOD,
      method: this.run.bind(this),
    };
  }
}
