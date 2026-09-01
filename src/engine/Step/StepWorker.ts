import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/Core/EngineStepInterface.js';

export abstract class StepWorker extends EngineStep {
  public getGroup(): string {
    return 'worker';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Worker', color: 'yellow' };
  }
}
