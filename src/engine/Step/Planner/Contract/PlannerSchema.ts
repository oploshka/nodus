import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sPlannerRequest, sPlannerSchema } from './PlannerTsType.js';

export abstract class PlannerSchema {
  public readonly group = 'planner';

  public abstract getSchema(request: sPlannerRequest): sPlannerSchema | Promise<sPlannerSchema>;

  public async execute(request: sPlannerRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.SCHEMA, schema: await this.getSchema(request) };
  }
}
