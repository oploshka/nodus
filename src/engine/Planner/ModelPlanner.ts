import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { Task } from '@engine/Task/Task.js';
import type { Plan } from '@engine/Planner/Plan.js';
import type { Planner } from '@engine/Planner/Planner.js';

interface PlannerModelResponse {
  steps: Array<{
    goal: string;
    constraints?: string[];
    knowledgeImpact?: string[];
  }>;
}

const plannerSchema: ModelResponseSchema = {
  description: 'A small semantic plan for the user task.',
  fields: {
    steps: {
      type: 'array',
      description: 'Ordered semantic work steps. Keep this list small.',
      items: {
        type: 'object',
        fields: {
          goal: { type: 'string', description: 'Outcome this step must achieve.' },
          constraints: {
            type: 'array',
            items: { type: 'string' },
            optional: true,
            description: 'User constraints relevant to this step.',
          },
          knowledgeImpact: {
            type: 'array',
            items: { type: 'string' },
            optional: true,
            description: 'Knowledge that may become stale or change after this step.',
          },
        },
      },
    },
  },
};

export class ModelPlanner implements Planner {
  public constructor(
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
  ) {}

  public async plan(task: Task): Promise<Plan> {
    const response = await callModel<PlannerModelResponse>(this.model, this.logger, {
      request: {
        message: 'Split this user request into the smallest useful set of executable semantic tasks.',
        data: task.description,
        format: ModelRequestFormat.Text,
        guidance: [
          'You are the high-level Planner inside Nodus.',
          'Create only steps that directly contribute to the user-requested outcome.',
          'Do not invent analysis, documentation, safety limits, configuration semantics, or other requirements the user did not ask for.',
          'Do not add research/understand/discover steps merely because implementation details are unknown; the Worker resolves missing project knowledge while executing.',
          'Do NOT solve implementation details, discover APIs, name files unless the user named them, or prescribe patch mechanics.',
          'Each step must be something a Worker can try to complete, not a question or preparatory investigation.',
          'Prefer one step when the request is one coherent change. Split only when parts are meaningfully independent or ordered.',
          'Preserve explicit user constraints and nothing more.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: plannerSchema },
      settings: { maxTokens: 2048 },
    });

    return {
      steps: response.steps.slice(0, 8).map((step, index) => ({
        // Step identity belongs to Nodus runtime, not to the model response.
        id: `step-${index + 1}`,
        goal: step.goal,
        constraints: step.constraints ?? [],
        knowledgeImpact: step.knowledgeImpact,
      })),
    };
  }
}
