import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult, tCoreRunDependencies } from '@engine/Core/CoreTsType.js';
import type { sWorkerRequest, sWorkerSchema } from './WorkerTsType.js';

export abstract class WorkerSchema {
  public readonly group = 'worker';

  protected constructor(public readonly id: string) {}

  public abstract getSchema(request: sWorkerRequest): sWorkerSchema | Promise<sWorkerSchema>;

  public async execute(
    request: sWorkerRequest,
    _dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.SCHEMA, schema: await this.getSchema(request) };
  }
}
