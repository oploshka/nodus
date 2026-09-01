import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/Core/EngineStepInterface.js';

export abstract class StepAction extends EngineStep {
  public getGroup(): string {
    return 'action';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Action', color: 'green' };
  }
}
