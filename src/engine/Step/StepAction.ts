import { EngineStep } from '@engine/Core/EngineStep.js';

export abstract class StepAction extends EngineStep {
  public getGroup(): string {
    return 'action';
  }
}
