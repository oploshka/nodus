import { EngineSchema } from '@engine/Core/EngineSchema.js';
import { ENGINE_STEP, type sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepPlanner } from '@engine/Step/StepPlanner.js';

const WORKER_CODE = 'WorkerCode';

/** Minimal Planner that forwards one task into WorkerCode. */
export class Planner extends StepPlanner {
  public getId(): string {
    return 'Planner';
  }

  public async run(
    step: sEngineSchemaStep,
    _dependencies: tEngineRunDependencies,
  ): Promise<EngineSchema> {
    return new EngineSchema([
      {
        type: ENGINE_STEP.SEQUENCE,
        module: WORKER_CODE,
        task: step.task,
        steps: null,
      },
    ]);
  }
}
