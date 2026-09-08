import { EngineStep } from '@engine/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/EngineStepInterface.js';

export abstract class StepQualifier extends EngineStep {
  public getGroup(): string {
    return 'qualifier';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Qualifier', color: 'cyan' };
  }
}
