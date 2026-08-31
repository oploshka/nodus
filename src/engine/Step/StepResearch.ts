import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/Core/EngineStepInterface.js';

export abstract class StepResearch extends EngineStep {
  public getGroup(): string {
    return 'research';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Research', color: 'brightMagenta' };
  }
}
