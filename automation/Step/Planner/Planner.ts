import { EngineStep } from '@engine/EngineStep.js';
import type { EngineDsl } from '@engine/EngineDsl.js';
import type { iEngineStep } from '@engine/EngineStepInterface.js';
import { ActionPlan, type sActionPlanResult } from './ActionPlan.js';

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
    const value = await dsl.runSteps(plan.steps, (planned, context) => ({
      step: this.qualification,
      input: {
        task: planned.task,
        context,
      },
    }));
    return value;
  }
}

function readPlan(value: unknown): sActionPlanResult {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { steps?: unknown }).steps)) {
    throw new Error('ActionPlan must return steps.');
  }
  return value as sActionPlanResult;
}
