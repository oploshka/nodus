import { STEP } from '../ProcessSchema.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  tProcessExecutableStep,
  tProcessModuleResult,
} from '../ProcessTsType.js';
import { WorkerSchema } from './WorkerSchema.js';
import type { sWorkerRequest, tWorkerResult } from './WorkerTsType.js';

export abstract class WorkerRunner implements iProcessModule {
  public readonly type = STEP.WORKER;

  public constructor(public readonly schema: WorkerSchema) {}

  public execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    const task = step.task ?? context.parent;
    if (typeof task !== 'string' || task.trim().length === 0) {
      throw new Error('WORKER requires a non-empty self-contained task.');
    }

    return this.run({ task, context });
  }

  public abstract run(request: sWorkerRequest): Promise<tWorkerResult>;
}
