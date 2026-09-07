import { EngineStep } from '@engine/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/EngineStepInterface.js';

export abstract class StepAction extends EngineStep {
  public getGroup(): string {
    return 'action';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Action', color: 'green' };
  }
}
