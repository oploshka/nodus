import { EngineDsl } from './EngineDsl.js';
import { EnginePoint, type tEnginePointContext } from './EnginePoint.js';
import type { iEngineStep, tEngineRunDependencies } from './EngineStepInterface.js';

type tEnginePointContexts = Map<EnginePoint, tEnginePointContext>;

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
    const pointContexts: tEnginePointContexts = new Map();
    const result = await step.run(input, dependencies);

    if (result instanceof EnginePoint) {
      return this.executePoint(result, input, dependencies, pointContexts);
    }

    return result;
  }

  private async executePoint(
    point: EnginePoint,
    input: unknown,
    dependencies: tEngineRunDependencies,
    pointContexts: tEnginePointContexts,
  ): Promise<unknown> {
    const context = this.getPointContext(point, pointContexts);
    const result = await this.executeStep(point.step, input, dependencies);
    if (!point.response) return result;

    const dsl = new EngineDsl(
      (step, childInput) => this.executeStep(step, childInput, dependencies),
      (nextPoint, nextInput) => this.executePoint(
        nextPoint,
        nextInput,
        dependencies,
        pointContexts,
      ),
    );

    return point.response(result, dsl, context);
  }

  private getPointContext(
    point: EnginePoint,
    pointContexts: tEnginePointContexts,
  ): tEnginePointContext {
    const existing = pointContexts.get(point);
    if (existing) return existing;

    const context = point.createContext();
    pointContexts.set(point, context);
    return context;
  }
}
