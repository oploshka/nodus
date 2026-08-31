import { EngineStep } from '@engine/Core/EngineStep.js';

/** Base class for worker Steps. */
export abstract class StepWorker extends EngineStep {
  public getGroup(): string {
    return 'worker';
  }
}
