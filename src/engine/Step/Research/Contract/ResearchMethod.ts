import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sResearchOutput, sResearchRequest } from './ResearchTsType.js';

export abstract class ResearchMethod {
  public readonly group = 'research';

  public abstract run(request: sResearchRequest): Promise<sResearchOutput>;

  public async execute(request: sResearchRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.OUTPUT, output: await this.run(request) };
  }
}
