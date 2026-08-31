import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepPlanner } from '@engine/Step/StepPlanner.js';

/** Minimal Planner used to verify the application -> Engine execution path. */
export class Planner extends StepPlanner {
  public getId(): string {
    return 'Planner';
  }

  public async run(
    step: sEngineSchemaStep,
    _dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return {
      status: 'SUCCESS',
      value: step.computedContext?.previous?.output?.value ?? step.data ?? step.computedContext?.parent,
    };
  }
}
