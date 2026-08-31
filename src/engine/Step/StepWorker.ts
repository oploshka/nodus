import { EngineStep } from '@engine/Core/EngineStep.js';

export abstract class StepWorker extends EngineStep {
  public getGroup(): string {
    return 'worker';
  }
}
