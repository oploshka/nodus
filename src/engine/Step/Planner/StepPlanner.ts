import { EngineStep } from '@engine/Core/EngineStep.js';

/** Base class for planner Steps. */
export abstract class StepPlanner extends EngineStep {
  public readonly group = 'planner';
}
