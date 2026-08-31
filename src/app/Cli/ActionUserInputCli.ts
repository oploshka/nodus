import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type {
  iCoreModule,
  sCoreModuleRequest,
  tCoreModuleResult,
  tCoreRunDependencies,
} from '@engine/Core/CoreTsType.js';

export class ActionUserInputCli implements iCoreModule {
  public readonly group = 'action';

  public async execute(
    request: sCoreModuleRequest,
    _dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    return {
      type: CORE_MODULE_RESULT.OUTPUT,
      output: {
        status: 'SUCCESS',
        value: request.task,
      },
    };
  }
}
