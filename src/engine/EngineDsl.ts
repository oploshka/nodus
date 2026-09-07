import type { EnginePoint, sEnginePointResolvedOption } from './EnginePoint.js';
import type { iEngineStep } from './EngineStepInterface.js';

type tRunStep = (step: iEngineStep, input?: unknown) => Promise<unknown>;
type tRunPoint = (point: EnginePoint, input?: unknown) => Promise<unknown>;
type tAvailablePoints = () => readonly sEnginePointResolvedOption[];

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

/** Runtime-bound escape hatch and execution helpers available to Point callbacks. */
export class EngineDsl {
  public constructor(
    private readonly executeStep: tRunStep,
    private readonly executePoint: tRunPoint,
    private readonly availablePoints: tAvailablePoints = () => [],
  ) {}

  /** Runs another Step imperatively as a child execution. */
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

  /** Returns transitions currently allowed from the active Point. */
  public available(): readonly sEnginePointResolvedOption[] {
    return this.availablePoints();
  }

  /** Imperatively continues the current parent Step through an allowed Point. */
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
