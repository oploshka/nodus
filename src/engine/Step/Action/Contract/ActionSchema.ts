import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sActionRequest, sActionSchema } from './ActionTsType.js';

export abstract class ActionSchema {
  public readonly group = 'action';

  public abstract getSchema(request: sActionRequest): sActionSchema | Promise<sActionSchema>;

  public async execute(request: sActionRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.SCHEMA, schema: await this.getSchema(request) };
  }
}
