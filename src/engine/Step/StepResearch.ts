import { EngineStep } from '@engine/EngineStep.js';
import type { sEngineStepMetadata } from '@engine/EngineStepInterface.js';

export abstract class StepResearch extends EngineStep {
  public getGroup(): string {
    return 'research';
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Research', color: 'brightMagenta' };
  }
}
