import { MODULE_RESULT, STEP } from './ProcessSchema.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  tProcessExecutableStep,
  tProcessModuleResult,
} from './ProcessTsType.js';
import {
  PROCESS_STEP_IMPLEMENTATION,
  type iProcessStepImplementation,
  type sProcessStepRequest,
  type tProcessStepRequestFactory,
  type tProcessStepRequestedId,
  type tProcessStepResult,
} from './ProcessStepTsType.js';
import { ProcessStepResolver, type iProcessStepResolver } from './ProcessStepResolver.js';

/** Shared Process adapter behind semantic roles such as WORKER, PLAN, QUALIFY and ACTION. */
export class ProcessStepRunner<
  TType extends STEP,
  TRequest extends sProcessStepRequest<TType> = sProcessStepRequest<TType>,
  TResult extends tProcessStepResult = tProcessStepResult,
> implements iProcessModule {
  public constructor(
    public readonly type: TType,
    public readonly implementations: ReadonlyArray<iProcessStepImplementation<TType, TRequest, TResult>>,
    private readonly resolver: iProcessStepResolver = new ProcessStepResolver(),
    private readonly requestedId: tProcessStepRequestedId = (step) => step.preset,
    private readonly requestFactory?: tProcessStepRequestFactory<TType, TRequest>,
  ) {
    if (type === STEP.SEQUENCE) throw new Error('SEQUENCE is executed by ProcessRuntime, not ProcessStepRunner.');
  }

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    if (step.type !== this.type) {
      throw new Error(`ProcessStepRunner ${this.type} cannot execute ${step.type}.`);
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
      case PROCESS_STEP_IMPLEMENTATION.SCHEMA:
        return {
          type: MODULE_RESULT.SCHEMA,
          schema: executable.schema,
        };

      case PROCESS_STEP_IMPLEMENTATION.METHOD:
        return executable.method(request);
    }
  }
}
