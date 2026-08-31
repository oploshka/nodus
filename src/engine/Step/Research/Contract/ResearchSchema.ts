import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sResearchRequest, sResearchSchema } from './ResearchTsType.js';

export abstract class ResearchSchema {
  public readonly group = 'research';

  public abstract getSchema(request: sResearchRequest): sResearchSchema | Promise<sResearchSchema>;

  public async execute(request: sResearchRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.SCHEMA, schema: await this.getSchema(request) };
  }
}
