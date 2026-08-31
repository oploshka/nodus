import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';

export class ActionUserInputCli extends EngineStep {
  public getId(): string {
    return 'ActionUserInputCli';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    step: sEngineSchemaStep,
    _dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return {
      status: 'SUCCESS',
      value: step.task,
    };
  }
}
