import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '../../model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '../../model/Response/ModelResponseFormat.js';
import { PlannerResponseSchema } from '../../model/Response/schema/PlannerResponseSchema.js';
import type { Task } from '../task/Task.js';
import type { Plan } from './Plan.js';
import type { Planner } from './Planner.js';

export class ModelPlanner implements Planner {
  private readonly schema = new PlannerResponseSchema();

  public constructor(private readonly model: ModelRunner) {}

  public async plan(task: Task): Promise<Plan> {
    const response = await this.model.run({
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
      response: {
        format: ModelResponseFormat.Raw,
        schema: this.schema,
      },
      settings: { maxTokens: 2048 },
    });

    return {
      steps: response.output.steps.map((step) => ({
        id: step.id,
        goal: step.goal,
        constraints: step.constraints,
        knowledgeImpact: step.knowledgeImpact,
      })),
    };
  }
}
