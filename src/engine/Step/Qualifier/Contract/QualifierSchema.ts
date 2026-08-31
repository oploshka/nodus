import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sQualifierRequest, sQualifierSchema } from './QualifierTsType.js';

export abstract class QualifierSchema {
  public readonly group = 'qualifier';

  public abstract getSchema(request: sQualifierRequest): sQualifierSchema | Promise<sQualifierSchema>;

  public async execute(request: sQualifierRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.SCHEMA, schema: await this.getSchema(request) };
  }
}
