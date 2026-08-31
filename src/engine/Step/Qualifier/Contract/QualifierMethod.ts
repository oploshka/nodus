import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sQualifierOutput, sQualifierRequest } from './QualifierTsType.js';

export abstract class QualifierMethod {
  public readonly group = 'qualifier';

  public abstract run(request: sQualifierRequest): Promise<sQualifierOutput>;

  public async execute(request: sQualifierRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.OUTPUT, output: await this.run(request) };
  }
}
