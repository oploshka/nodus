import { MODULE_RESULT, STEP } from '@engine/Process/ProcessSchema.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  tProcessExecutableStep,
  tProcessModuleResult,
} from '@engine/Process/ProcessTsType.js';
import {
  WORKER_IMPLEMENTATION,
  type iWorkerModule,
  type sWorkerRequest,
} from './Contract/WorkerTsType.js';
import { WorkerResolver, type iWorkerResolver } from './WorkerResolver.js';

/** Process adapter for automation Workers. Core decides which Worker to use and how to execute it. */
export class WorkerRunner implements iProcessModule {
  public readonly type = STEP.WORKER;

  public constructor(
    public readonly workers: ReadonlyArray<iWorkerModule>,
    private readonly resolver: iWorkerResolver = new WorkerResolver(),
  ) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    const task = step.task ?? context.parent;
    if (typeof task !== 'string' || task.trim().length === 0) {
      throw new Error('WORKER requires a non-empty self-contained task.');
    }

    const worker = this.resolver.resolve(step.preset, this.workers);
    const request: sWorkerRequest = { task, context };
    const implementation = worker.getImplementation();

    switch (implementation.type) {
      case WORKER_IMPLEMENTATION.SCHEMA:
        return {
          type: MODULE_RESULT.SCHEMA,
          schema: implementation.schema,
        };

      case WORKER_IMPLEMENTATION.METHOD:
        return implementation.method(request);
    }
  }
}
