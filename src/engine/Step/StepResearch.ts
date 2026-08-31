import { EngineStep } from '@engine/Core/EngineStep.js';

export abstract class StepResearch extends EngineStep {
  public getGroup(): string {
    return 'research';
  }
}
