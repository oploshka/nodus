import {
  WORKER_IMPLEMENTATION,
  type iWorkerModule,
  type sWorkerSchema,
  type tWorkerImplementation,
} from './WorkerTsType.js';

/** Base class for automation Workers whose implementation is expressed as a local Process schema. */
export abstract class WorkerSchema implements iWorkerModule {
  public abstract getId(): string;
  public abstract getSchema(): sWorkerSchema;

  public getImplementation(): tWorkerImplementation {
    return {
      type: WORKER_IMPLEMENTATION.SCHEMA,
      schema: this.getSchema(),
    };
  }
}
