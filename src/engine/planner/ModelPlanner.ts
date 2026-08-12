import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { PlannerResponseFormatter } from '../../model/Response/PlannerResponseFormatter.js';
import type { Task } from '../task/Task.js';
import type { Plan } from './Plan.js';
import type { Planner } from './Planner.js';

export class ModelPlanner implements Planner {
  private readonly formatter = new PlannerResponseFormatter();

  public constructor(private readonly model: ModelRunner) {}

  public async plan(task: Task): Promise<Plan> {
    const response = await this.model.run({
      maxTokens: 2048,
      formatter: this.formatter,
      messages: [
        {
          role: 'system',
          content: [
            'You are the high-level Planner inside Nodus.',
            'Break the user task into semantic work steps only.',
            'Do NOT solve implementation details, discover APIs, name files unless the user named them, or prescribe patch mechanics.',
            'A step describes an outcome, not a tool action.',
            'Keep the plan small. Preserve user constraints.',
            '',
            this.formatter.instructions(),
          ].join('\n'),
        },
        { role: 'user', content: task.description },
      ],
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
