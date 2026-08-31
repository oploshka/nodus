import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sPlannerOutput, sPlannerRequest } from './PlannerTsType.js';

export abstract class PlannerMethod {
  public readonly group = 'planner';

  public abstract run(request: sPlannerRequest): Promise<sPlannerOutput>;

  public async execute(request: sPlannerRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.OUTPUT, output: await this.run(request) };
  }
}
