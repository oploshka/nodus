import { CORE_MODULE_RESULT, CORE_STEP, type sCoreOutput, type sCoreSequence } from './CoreSchema.js';
import type {
  iCoreModule,
  sCoreModuleRequest,
  tCoreModuleResult,
  tCoreRunDependencies,
} from './CoreTsType.js';

export type tEngineStepRunResult = sCoreOutput | sCoreSequence;

export interface iEngineStep extends iCoreModule {
  run(
    request: sCoreModuleRequest,
    dependencies: tCoreRunDependencies,
  ): tEngineStepRunResult | Promise<tEngineStepRunResult>;
}

/** Shared executable Step contract. Concrete Steps only implement run(). */
export abstract class EngineStep implements iEngineStep {
  public abstract readonly group: string;
  public readonly id?: string;

  protected constructor(id?: string) {
    this.id = id;
  }

  public abstract run(
    request: sCoreModuleRequest,
    dependencies: tCoreRunDependencies,
  ): tEngineStepRunResult | Promise<tEngineStepRunResult>;

  public async execute(
    request: sCoreModuleRequest,
    dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    const result = await this.run(request, dependencies);

    if ('type' in result && result.type === CORE_STEP.SEQUENCE) {
      return {
        type: CORE_MODULE_RESULT.SCHEMA,
        schema: result,
      };
    }

    return {
      type: CORE_MODULE_RESULT.OUTPUT,
      output: result,
    };
  }
}
