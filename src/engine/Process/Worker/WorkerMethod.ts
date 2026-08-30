import {
  WORKER_IMPLEMENTATION,
  type iWorkerModule,
  type sWorkerRequest,
  type tWorkerImplementation,
  type tWorkerResult,
} from './WorkerTsType.js';

/** Base class for automation Workers implemented by custom JavaScript/TypeScript logic. */
export abstract class WorkerMethod implements iWorkerModule {
  public abstract getId(): string;
  public abstract run(request: sWorkerRequest): Promise<tWorkerResult>;

  public getImplementation(): tWorkerImplementation {
    return {
      type: WORKER_IMPLEMENTATION.METHOD,
      method: this.run.bind(this),
    };
  }
}
