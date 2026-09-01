import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/Core/EngineStepInterface.js';

export abstract class StepPlanner extends EngineStep {
  public getGroup(): string {
    return 'planner';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Planner', color: 'magenta' };
  }
}
