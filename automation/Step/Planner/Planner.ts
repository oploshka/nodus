import type { sEngineOutput } from '@engine/Core/EngineSchemaTsType.js';
import type { sEngineStepRequest, tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepPlanner } from '@engine/Step/Planner/StepPlanner.js';

/** Minimal Planner used to verify the application -> Engine execution path. */
export class Planner extends StepPlanner {
  public getId(): string {
    return 'Planner';
  }

  public async run(
    request: sEngineStepRequest,
    _dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return {
      status: 'SUCCESS',
      value: request.context.previous?.value ?? request.task,
    };
  }
}
