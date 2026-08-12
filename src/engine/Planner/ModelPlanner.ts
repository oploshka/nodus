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
    id: string;
    goal: string;
    constraints: string[];
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
          id: { type: 'string', description: 'Stable short step id.' },
          goal: { type: 'string', description: 'Outcome this step must achieve.' },
          constraints: { type: 'array', items: { type: 'string' }, description: 'User constraints relevant to this step.' },
          knowledgeImpact: { type: 'array', items: { type: 'string' }, optional: true, description: 'Knowledge that may become stale or change after this step.' },
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
        message: 'Break this user task into a small semantic plan.',
        data: task.description,
        format: ModelRequestFormat.Text,
        guidance: [
          'You are the high-level Planner inside Nodus.',
          'Break the user task into semantic work steps only.',
          'Do NOT solve implementation details, discover APIs, name files unless the user named them, or prescribe patch mechanics.',
          'A step describes an outcome, not a tool action.',
          'Keep the plan small. Preserve user constraints.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: plannerSchema },
      settings: { maxTokens: 2048 },
    });

    return {
      steps: response.steps.slice(0, 8).map((step) => ({
        id: step.id,
        goal: step.goal,
        constraints: step.constraints,
        knowledgeImpact: step.knowledgeImpact,
      })),
    };
  }
}
