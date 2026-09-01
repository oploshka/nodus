import type { EnginePoint } from './EnginePoint.js';
import type { iEngineStep } from './EngineStepInterface.js';

type tRunStep = (step: iEngineStep, input?: unknown) => Promise<unknown>;
type tRunPoint = (point: EnginePoint, input?: unknown) => Promise<unknown>;

export interface sEngineResultRef {
  resultOf: string;
}

export interface sEngineRunStepsItem {
  id: string;
  context?: Readonly<Record<string, sEngineResultRef>>;
}

export interface sEngineRunStepConfig {
  step: iEngineStep;
  input?: unknown;
}

type tRunStepsFactory<T extends sEngineRunStepsItem> = (
  item: T,
  context: Readonly<Record<string, unknown>>,
) => sEngineRunStepConfig;

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

  /** Runs nested Steps sequentially and resolves result references between them. */
  public async runSteps<T extends sEngineRunStepsItem>(
    items: readonly T[],
    create: tRunStepsFactory<T>,
  ): Promise<unknown> {
    const results = new Map<string, unknown>();
    let lastResult: unknown;

    for (const item of items) {
      const context = resolveContext(item.context, results);
      const run = create(item, context);
      lastResult = await this.runStep(run.step, run.input);
      results.set(item.id, lastResult);
    }

    return lastResult;
  }

  /** Continues the current parent Step through another declared Point. */
  public runPoint(point: EnginePoint, input?: unknown): Promise<unknown> {
    return this.executePoint(point, input);
  }
}

function resolveContext(
  context: Readonly<Record<string, sEngineResultRef>> | undefined,
  results: ReadonlyMap<string, unknown>,
): Record<string, unknown> {
  if (!context) return {};

  return Object.fromEntries(Object.entries(context).map(([name, reference]) => {
    if (!results.has(reference.resultOf)) {
      throw new Error(`Step requires unavailable result '${reference.resultOf}'.`);
    }
    return [name, results.get(reference.resultOf)];
  }));
}
