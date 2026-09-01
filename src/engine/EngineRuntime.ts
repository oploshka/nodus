import { EngineDsl } from './EngineDsl.js';
import { EnginePoint } from './EnginePoint.js';
import type { iEngineStep, tEngineRunDependencies } from './EngineStepInterface.js';

/** Minimal point-based runtime. Schema/history integration remains intentionally absent. */
export class EngineRuntime {
  public async run(
    step: iEngineStep,
    input?: unknown,
    dependencies: tEngineRunDependencies = {},
  ): Promise<unknown> {
    return this.executeStep(step, input, dependencies);
  }

  private async executeStep(
    step: iEngineStep,
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<unknown> {
    const result = await step.run(input, dependencies);
    if (result instanceof EnginePoint) {
      return this.executePoint(result, input, dependencies);
    }
    return result;
  }

  private async executePoint(
    point: EnginePoint,
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<unknown> {
    const result = await this.executeStep(point.step, input, dependencies);
    if (!point.response) return result;

    const dsl = new EngineDsl(
      (step, childInput) => this.executeStep(step, childInput, dependencies),
      (nextPoint, nextInput) => this.executePoint(nextPoint, nextInput, dependencies),
    );

    return point.response(result, dsl);
  }
}
