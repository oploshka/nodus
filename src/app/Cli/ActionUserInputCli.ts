import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput } from '@engine/Core/EngineSchemaTsType.js';
import type { sEngineStepRequest, tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';

export class ActionUserInputCli extends EngineStep {
  public getId(): string {
    return 'ActionUserInputCli';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    request: sEngineStepRequest,
    _dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return {
      status: 'SUCCESS',
      value: request.task,
    };
  }
}
