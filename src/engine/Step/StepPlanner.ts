import { EngineStep } from '@engine/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/EngineStepInterface.js';

export abstract class StepPlanner extends EngineStep {
  public getGroup(): string {
    return 'planner';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Planner', color: 'magenta' };
  }
}
