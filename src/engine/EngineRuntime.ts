import { isEngineDirective } from './EngineDirective.js';
import { EngineDsl } from './EngineDsl.js';
import type { tEngineEmit, tEngineEventListener } from './EngineEvent.js';
import {
  EnginePoint,
  type sEnginePointResolvedOption,
  type tEnginePointContext,
} from './EnginePoint.js';
import type { tEngineStepContext } from './EngineStepContext.js';
import type { iEngineStep, tEngineRunDependencies } from './EngineStepInterface.js';
import type { EngineStepRun, sEngineStepRunParent } from './EngineStepRun.js';

type tEnginePointContexts = Map<EnginePoint, tEnginePointContext>;

interface sEnginePointRun {
  point: EnginePoint;
  stepRun: EngineStepRun;
  input: unknown;
  context: tEnginePointContext;
}

/** Creates an isolated execution for every root Step run. */
export class EngineRuntime {
  public async run(
    step: iEngineStep,
    input?: unknown,
    dependencies: tEngineRunDependencies = {},
  ): Promise<unknown> {
    return new EngineExecution(dependencies).run(step, input);
  }
}

/** Owns mutable runtime state for one root execution tree. */
class EngineExecution {
  private readonly runs = new Map<string, EngineStepRun>();
  private runSequence = 0;

  public constructor(private readonly dependencies: tEngineRunDependencies) {}

  public async run(step: iEngineStep, input: unknown): Promise<unknown> {
    const run = await this.executeStep(step, input);
    return run.result;
  }

  private async executeStep(
    step: iEngineStep,
    input: unknown,
    parent?: sEngineStepRunParent,
  ): Promise<EngineStepRun> {
    const run: EngineStepRun = {
      id: this.nextRunId(),
      step,
      input,
      context: step.createContext(input),
      parent,
      status: 'running',
    };
    const pointContexts: tEnginePointContexts = new Map();
    this.runs.set(run.id, run);

    const dependencies = this.createRunDependencies(run);
    const emit = dependencies.emit as tEngineEmit | undefined;
    emit?.({ type: 'step.start', data: { input } });

    try {
      const initial = await step.run(input, dependencies, run.context);
      run.result = initial instanceof EnginePoint
        ? await this.executePoint(initial, input, run, pointContexts)
        : initial;
      run.status = 'completed';
      emit?.({ type: 'step.finish', data: { result: run.result } });
      return run;
    } catch (error) {
      run.status = 'failed';
      run.error = error;
      emit?.({
        type: 'step.error',
        level: 'error',
        data: {
          reason: error instanceof Error ? error.message : String(error),
          error,
        },
      });
      throw error;
    }
  }

  private async executePoint(
    point: EnginePoint,
    input: unknown,
    stepRun: EngineStepRun,
    pointContexts: tEnginePointContexts,
  ): Promise<unknown> {
    const pointRun: sEnginePointRun = {
      point,
      stepRun,
      input,
      context: this.getPointContext(point, pointContexts, input, stepRun.context),
    };

    const available = this.getAvailableOptions(pointRun, pointContexts);
    const stepInput = point.createInput({
      input: pointRun.input,
      context: pointRun.context,
      stepContext: stepRun.context,
      available,
    });

    const childRun = await this.executeStep(point.step, stepInput, {
      runId: stepRun.id,
      point,
    });
    const result = childRun.result;
    if (!point.response) return result;

    const dsl = new EngineDsl(
      async (step, childInput) => {
        const run = await this.executeStep(step, childInput, {
          runId: stepRun.id,
          point,
        });
        return run.result;
      },
      (nextPoint, nextInput) => this.executeAvailablePoint(
        pointRun,
        nextPoint,
        nextInput,
        pointContexts,
      ),
      () => this.getAvailableOptions(pointRun, pointContexts),
    );

    const response = await point.response({
      result,
      dsl,
      context: pointRun.context,
      stepContext: stepRun.context,
      available: this.getAvailableOptions(pointRun, pointContexts),
    });

    if (isEngineDirective(response)) {
      return this.executeAvailablePoint(
        pointRun,
        response.point,
        response.input,
        pointContexts,
      );
    }

    return response;
  }

  private async executeAvailablePoint(
    pointRun: sEnginePointRun,
    nextPoint: EnginePoint,
    input: unknown,
    pointContexts: tEnginePointContexts,
  ): Promise<unknown> {
    const available = this.getAvailableOptions(pointRun, pointContexts);
    if (!available.some((option) => option.point === nextPoint)) {
      throw new Error(
        `Point '${pointName(pointRun.point)}' cannot continue through '${pointName(nextPoint)}'.`,
      );
    }

    return this.executePoint(nextPoint, input, pointRun.stepRun, pointContexts);
  }

  private getAvailableOptions(
    pointRun: sEnginePointRun,
    pointContexts: tEnginePointContexts,
  ): readonly sEnginePointResolvedOption[] {
    return pointRun.point.getOptions()
      .filter((option) => !option.available || option.available({
        context: pointRun.context,
        stepContext: pointRun.stepRun.context,
        nextPoint: option.point,
        nextContext: pointContexts.get(option.point),
      }))
      .map((option) => ({ point: option.point }));
  }

  private getPointContext(
    point: EnginePoint,
    pointContexts: tEnginePointContexts,
    input: unknown,
    stepContext: tEngineStepContext,
  ): tEnginePointContext {
    const existing = pointContexts.get(point);
    if (existing) return existing;

    const context = point.createContext({ input, stepContext });
    pointContexts.set(point, context);
    return context;
  }

  private createRunDependencies(run: EngineStepRun): tEngineRunDependencies {
    const listener = this.dependencies.onEvent as tEngineEventListener | undefined;
    if (!listener) return this.dependencies;

    const emit: tEngineEmit = (event) => listener({
      event,
      path: this.getRunPath(run),
      module: run.step.getId() ?? run.step.constructor.name,
      step: run.step,
    });

    return {
      ...this.dependencies,
      emit,
    };
  }

  private getRunPath(run: EngineStepRun): string[] {
    const path = [run.id];
    let parentId = run.parent?.runId;

    while (parentId) {
      const parent = this.runs.get(parentId);
      if (!parent) break;
      path.unshift(parent.id);
      parentId = parent.parent?.runId;
    }

    return path;
  }

  private nextRunId(): string {
    this.runSequence += 1;
    return `run-${this.runSequence}`;
  }
}

function pointName(point: EnginePoint): string {
  return point.name ?? point.step.getId() ?? point.step.constructor.name;
}
