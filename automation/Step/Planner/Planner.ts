import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type {
  iCoreModule,
  sCoreModuleRequest,
  tCoreModuleResult,
  tCoreRunDependencies,
} from '@engine/Core/CoreTsType.js';

/** Minimal Planner used to verify the application -> Core execution path. */
export class Planner implements iCoreModule {
  public readonly group = 'planner';

  public async execute(
    request: sCoreModuleRequest,
    _dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    return {
      type: CORE_MODULE_RESULT.OUTPUT,
      output: {
        status: 'SUCCESS',
        value: request.context.previous?.value ?? request.task,
      },
    };
  }
}
