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
} from './WorkerTsType.js';

/** Process adapter for one automation Worker. Core decides whether to execute its schema or method. */
export class WorkerRunner implements iProcessModule {
  public readonly type = STEP.WORKER;

  public constructor(public readonly worker: iWorkerModule) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    const task = step.task ?? context.parent;
    if (typeof task !== 'string' || task.trim().length === 0) {
      throw new Error('WORKER requires a non-empty self-contained task.');
    }

    const request: sWorkerRequest = { task, context };
    const implementation = this.worker.getImplementation();

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
