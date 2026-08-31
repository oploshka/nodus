import { CLI_EXIT, readCliInput } from '@app/Cli/Cli.js';
import { EngineSchema } from '@engine/Core/EngineSchema.js';
import { ENGINE_STEP, type sEngineOutput, type sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import { EngineStep } from '@engine/Core/EngineStep.js';
import type { tEngineRunDependencies, tEngineStepRunResult } from '@engine/Core/EngineStepInterface.js';

const PLANNER = 'Planner';

export class ActionUserInputCli extends EngineStep {
  public getId(): string {
    return 'ActionUserInputCli';
  }

  public getGroup(): string {
    return 'cli';
  }

  public async run(
    _step: sEngineSchemaStep,
    _dependencies: tEngineRunDependencies,
  ): Promise<tEngineStepRunResult> {
    const input = await readCliInput();
    if (input === CLI_EXIT) {
      const output: sEngineOutput = {
        status: 'SUCCESS',
        value: CLI_EXIT,
      };
      return output;
    }

    return new EngineSchema([
      {
        type: ENGINE_STEP.SEQUENCE,
        module: PLANNER,
        task: input,
        steps: null,
      },
    ]);
  }
}
