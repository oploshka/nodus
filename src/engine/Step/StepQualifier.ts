import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/Core/EngineStepInterface.js';

export abstract class StepQualifier extends EngineStep {
  public getGroup(): string {
    return 'qualifier';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Qualifier', color: 'cyan' };
  }
}
