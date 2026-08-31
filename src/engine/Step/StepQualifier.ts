import { EngineStep } from '@engine/Core/EngineStep.js';

export abstract class StepQualifier extends EngineStep {
  public getGroup(): string {
    return 'qualifier';
  }
}
