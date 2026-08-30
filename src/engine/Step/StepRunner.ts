import { MODULE_RESULT, STEP } from '@engine/Process/ProcessSchema.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  tProcessExecutableStep,
  tProcessModuleResult,
} from '@engine/Process/ProcessTsType.js';
import {
  STEP_IMPLEMENTATION,
  type iStepImplementation,
  type sStepRequest,
  type tStepRequestFactory,
  type tStepRequestedId,
  type tStepResult,
} from './Contract/StepTsType.js';
import { StepResolver, type iStepResolver } from './StepResolver.js';

/** Shared Process adapter behind semantic Step roles such as WORKER, PLAN and ACTION. */
export class StepRunner<
  TType extends STEP,
  TRequest extends sStepRequest<TType> = sStepRequest<TType>,
  TResult extends tStepResult = tStepResult,
> implements iProcessModule {
  public constructor(
    public readonly type: TType,
    public readonly implementations: ReadonlyArray<iStepImplementation<TType, TRequest, TResult>>,
    private readonly resolver: iStepResolver = new StepResolver(),
    private readonly requestedId: tStepRequestedId = (step) => step.preset,
    private readonly requestFactory?: tStepRequestFactory<TType, TRequest>,
  ) {
    if (type === STEP.SEQUENCE) throw new Error('SEQUENCE is executed by ProcessRuntime, not StepRunner.');
  }

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    if (step.type !== this.type) {
      throw new Error(`StepRunner ${this.type} cannot execute ${step.type}.`);
    }

    const task = step.task ?? context.parent;
    if (typeof task !== 'string' || task.trim().length === 0) {
      throw new Error(`${this.type} requires a non-empty self-contained task.`);
    }

    const implementation = this.resolver.resolve(
      this.requestedId(step),
      this.implementations,
      this.type,
    );
    const request = this.requestFactory
      ? this.requestFactory(step, context, task)
      : ({ type: this.type, task, context } as TRequest);
    const executable = implementation.getImplementation();

    switch (executable.type) {
      case STEP_IMPLEMENTATION.SCHEMA:
        return {
          type: MODULE_RESULT.SCHEMA,
          schema: executable.schema,
        };

      case STEP_IMPLEMENTATION.METHOD:
        return executable.method(request);
    }
  }
}
