import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sWorkerOutput, sWorkerRequest } from './WorkerTsType.js';

export abstract class WorkerMethod {
  public readonly group = 'worker';

  public abstract run(request: sWorkerRequest): Promise<sWorkerOutput>;

  public async execute(request: sWorkerRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.OUTPUT, output: await this.run(request) };
  }
}
