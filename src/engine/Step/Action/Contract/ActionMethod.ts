import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sActionOutput, sActionRequest } from './ActionTsType.js';

export abstract class ActionMethod {
  public readonly group = 'action';

  public abstract run(request: sActionRequest): Promise<sActionOutput>;

  public async execute(request: sActionRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.OUTPUT, output: await this.run(request) };
  }
}
