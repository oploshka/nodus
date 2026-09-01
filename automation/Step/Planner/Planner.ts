import { EngineStep } from '@engine/EngineStep.js';
import type { EngineDsl } from '@engine/EngineDsl.js';
import type { iEngineStep } from '@engine/EngineStepInterface.js';
import { ActionPlan, type sActionPlanResult, type sPlanResultRef } from './ActionPlan.js';

/** Planner materializes a plan by running each planned task as a nested Qualification Step. */
export class Planner extends EngineStep {
  private readonly points = {
    plan: this.point({
      step: new ActionPlan(),
      response: async (result, dsl) => this.runPlan(result, dsl),
    }),
  };

  public constructor(private readonly qualification: iEngineStep) {
    super();
  }

  public getId(): string {
    return 'Planner';
  }

  public getGroup(): string {
    return 'planner';
  }

  public async run(_input: unknown): Promise<unknown> {
    return this.points.plan;
  }

  private async runPlan(result: unknown, dsl: EngineDsl): Promise<unknown> {
    const plan = readPlan(result);
    const results = new Map<string, unknown>();
    let lastResult: unknown;

    for (const planned of plan.steps) {
      const context = resolveContext(planned.context, results);
      lastResult = await dsl.runStep(this.qualification, {
        task: planned.task,
        context,
      });
      results.set(planned.id, lastResult);
    }

    return lastResult;
  }
}

function readPlan(value: unknown): sActionPlanResult {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { steps?: unknown }).steps)) {
    throw new Error('ActionPlan must return steps.');
  }
  return value as sActionPlanResult;
}

function resolveContext(
  context: Readonly<Record<string, sPlanResultRef>> | undefined,
  results: ReadonlyMap<string, unknown>,
): Record<string, unknown> {
  if (!context) return {};

  return Object.fromEntries(Object.entries(context).map(([name, reference]) => {
    if (!results.has(reference.resultOf)) {
      throw new Error(`Planned Step requires unavailable result '${reference.resultOf}'.`);
    }
    return [name, results.get(reference.resultOf)];
  }));
}
