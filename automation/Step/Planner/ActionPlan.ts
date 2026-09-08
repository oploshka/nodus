import type { sEngineResultRef } from '@engine/EngineDsl.js';
import type { tEngineEmit } from '@engine/EngineEvent.js';
import { EngineStep } from '@engine/EngineStep.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';

export interface sPlannedStep {
  id: string;
  task: string;
  context?: Readonly<Record<string, sEngineResultRef>>;
}

export interface sActionPlanResult {
  steps: readonly sPlannedStep[];
}

interface sPlanDecisionStep {
  id: string;
  task: string;
  dependsOn?: string[];
}

interface sPlanDecision {
  steps: sPlanDecisionStep[];
}

const planSchema: ModelResponseSchema = {
  description: 'A small sequential plan whose tasks can each be executed as an independent nested Step.',
  fields: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        fields: {
          id: {
            type: 'string',
            description: 'Short unique id for this planned Step.',
          },
          task: {
            type: 'string',
            description: 'Concrete outcome assigned to this Step.',
          },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            optional: true,
            description: 'Ids of earlier Steps whose results are required as context.',
          },
        },
      },
    },
  },
};

/** Produces the dynamic nested Step sequence for a task classified as multi-step. */
export class ActionPlan extends EngineStep {
  public getId(): string {
    return 'ActionPlan';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<sActionPlanResult> {
    const model = dependencies.model as ModelRunner | undefined;
    const emit = dependencies.emit as tEngineEmit | undefined;
    if (!model || !emit) {
      throw new Error('ActionPlan requires runtime model and emit.');
    }

    const decision = await callModel<sPlanDecision>(model, emit, {
      request: {
        message: 'Decompose the assigned task into the smallest useful sequence of executable Steps.',
        data: { input },
        format: ModelRequestFormat.Json,
        guidance: [
          'Create between 2 and 8 Steps.',
          'Every Step must describe a concrete outcome, not a vague phase such as "analyze" or "continue".',
          'Keep independent work independent; add dependsOn only when a later Step truly needs an earlier result.',
          'Dependencies may reference only earlier Step ids because execution is sequential.',
          'The final Step should complete the original requested outcome using prior results when needed.',
          'Do not include tool-level operations such as reading a file; nested Workers decide those details themselves.',
        ].join('\n'),
      },
      response: {
        format: ModelResponseFormat.Raw,
        schema: planSchema,
      },
      settings: { maxTokens: 1536 },
    });

    return { steps: normalizePlan(decision.steps) };
  }
}

function normalizePlan(steps: readonly sPlanDecisionStep[]): sPlannedStep[] {
  const selected = steps.slice(0, 8);
  if (selected.length < 2) {
    throw new Error('ActionPlan must return at least two planned Steps.');
  }

  const known = new Set<string>();
  const result: sPlannedStep[] = [];

  for (const raw of selected) {
    const id = raw.id.trim();
    const task = raw.task.trim();
    if (!id) throw new Error('ActionPlan returned a Step without an id.');
    if (!task) throw new Error(`ActionPlan returned empty task for Step '${id}'.`);
    if (known.has(id)) throw new Error(`ActionPlan returned duplicate Step id '${id}'.`);

    const dependencies = [...new Set(raw.dependsOn ?? [])]
      .map((dependency) => dependency.trim())
      .filter(Boolean);

    for (const dependency of dependencies) {
      if (!known.has(dependency)) {
        throw new Error(
          `ActionPlan Step '${id}' depends on unavailable earlier Step '${dependency}'.`,
        );
      }
    }

    result.push({
      id,
      task,
      context: dependencies.length > 0
        ? Object.fromEntries(dependencies.map((dependency) => [
          dependency,
          { resultOf: dependency },
        ]))
        : undefined,
    });
    known.add(id);
  }

  return result;
}
