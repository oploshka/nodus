import { EngineDsl } from './EngineDsl.js';
import { EnginePoint, type tEnginePointContext } from './EnginePoint.js';
import type { tEngineStepContext } from './EngineStepContext.js';
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
    const stepContext = step.createContext(input);
    const pointContexts: tEnginePointContexts = new Map();
    const result = await step.run(input, dependencies, stepContext);

    if (result instanceof EnginePoint) {
      return this.executePoint(
        result,
        input,
        dependencies,
        stepContext,
        pointContexts,
      );
    }

    return result;
  }

  private async executePoint(
    point: EnginePoint,
    input: unknown,
    dependencies: tEngineRunDependencies,
    stepContext: tEngineStepContext,
    pointContexts: tEnginePointContexts,
  ): Promise<unknown> {
    const context = this.getPointContext(point, pointContexts, input);
    const available = this.getAvailablePoints(point, context, stepContext, pointContexts);
    const stepInput = point.createInput(input, context, stepContext, available);
    const result = await this.executeStep(point.step, stepInput, dependencies);
    if (!point.response) return result;

    const dsl = new EngineDsl(
      (step, childInput) => this.executeStep(step, childInput, dependencies),
      (nextPoint, nextInput) => this.executeAvailablePoint(
        point,
        context,
        nextPoint,
        nextInput,
        dependencies,
        stepContext,
        pointContexts,
      ),
      () => this.getAvailablePoints(point, context, stepContext, pointContexts),
    );

    return point.response(result, dsl, context, stepContext);
  }

  private async executeAvailablePoint(
    point: EnginePoint,
    context: tEnginePointContext,
    nextPoint: EnginePoint,
    input: unknown,
    dependencies: tEngineRunDependencies,
    stepContext: tEngineStepContext,
    pointContexts: tEnginePointContexts,
  ): Promise<unknown> {
    const available = this.getAvailablePoints(point, context, stepContext, pointContexts);
    if (!available.includes(nextPoint)) {
      throw new Error(
        `Point '${pointName(point)}' cannot continue through '${pointName(nextPoint)}'.`,
      );
    }

    return this.executePoint(nextPoint, input, dependencies, stepContext, pointContexts);
  }

  private getAvailablePoints(
    point: EnginePoint,
    context: tEnginePointContext,
    stepContext: tEngineStepContext,
    pointContexts: tEnginePointContexts,
  ): readonly EnginePoint[] {
    return point.getOptions()
      .filter((option) => !option.available || option.available({
        context,
        stepContext,
        nextPoint: option.point,
        nextContext: pointContexts.get(option.point),
      }))
      .map((option) => option.point);
  }

  private getPointContext(
    point: EnginePoint,
    pointContexts: tEnginePointContexts,
    input: unknown,
  ): tEnginePointContext {
    const existing = pointContexts.get(point);
    if (existing) return existing;

    const context = point.createContext(input);
    pointContexts.set(point, context);
    return context;
  }
}

function pointName(point: EnginePoint): string {
  return point.name ?? point.step.getId() ?? point.step.constructor.name;
}
