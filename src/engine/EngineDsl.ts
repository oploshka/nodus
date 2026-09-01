import type { EnginePoint } from './EnginePoint.js';
import type { iEngineStep } from './EngineStepInterface.js';

type tRunStep = (step: iEngineStep, input?: unknown) => Promise<unknown>;
type tRunPoint = (point: EnginePoint, input?: unknown) => Promise<unknown>;

/** Runtime-bound API available while a parent Step handles a Point result. */
export class EngineDsl {
  public constructor(
    private readonly executeStep: tRunStep,
    private readonly executePoint: tRunPoint,
  ) {}

  /** Runs another Step as a child execution and returns its completed value. */
  public runStep(step: iEngineStep, input?: unknown): Promise<unknown> {
    return this.executeStep(step, input);
  }

  /** Continues the current parent Step through another declared Point. */
  public runPoint(point: EnginePoint, input?: unknown): Promise<unknown> {
    return this.executePoint(point, input);
  }
}
