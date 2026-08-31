import { EngineStep } from '@engine/Core/EngineStep.js';

export abstract class StepPlanner extends EngineStep {
  public getGroup(): string {
    return 'planner';
  }
}
