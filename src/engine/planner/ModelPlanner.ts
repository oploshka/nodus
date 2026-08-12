import type { ModelConfiguration } from '../../app/config/Configuration.js';
import type { ModelAdapter } from '../../model/Adapter/ModelAdapter.js';
import type { Task } from '../task/Task.js';
import type { Plan, PlanStep } from './Plan.js';
import type { Planner } from './Planner.js';

export class ModelPlanner implements Planner {
  public constructor(
    private readonly model: ModelAdapter,
    private readonly configuration: ModelConfiguration,
  ) {}

  public async plan(task: Task): Promise<Plan> {
    const response = await this.model.complete({
      model: this.configuration.model,
      temperature: 0,
      maxTokens: Math.min(this.configuration.maxTokens ?? 4096, 2048),
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
            'Return protocol:',
            'STEP <id>',
            'GOAL <one-line semantic goal>',
            'CONSTRAINT <one-line constraint>  (repeat as needed)',
            'IMPACTS <optional knowledge area that may become stale>  (repeat as needed)',
            'END',
            'Repeat STEP..END for each step.',
          ].join('\n'),
        },
        { role: 'user', content: task.description },
      ],
    });
    return { steps: this.parse(response.content) };
  }

  private parse(content: string): PlanStep[] {
    const lines = content.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
    const steps: PlanStep[] = [];
    let current: PlanStep | undefined;
    for (const line of lines) {
      if (line.startsWith('STEP ')) {
        if (current) steps.push(current);
        current = { id: line.slice(5).trim(), goal: '', constraints: [], knowledgeImpact: [] };
        continue;
      }
      if (!current) continue;
      if (line.startsWith('GOAL ')) current.goal = line.slice(5).trim();
      else if (line.startsWith('CONSTRAINT ')) current.constraints.push(line.slice(11).trim());
      else if (line.startsWith('IMPACTS ')) current.knowledgeImpact?.push(line.slice(8).trim());
      else if (line === 'END') { steps.push(current); current = undefined; }
    }
    if (current) steps.push(current);
    const valid = steps.filter((step) => step.id && step.goal);
    if (valid.length === 0) throw new Error(`Planner returned no valid steps: ${content.slice(0, 500)}`);
    return valid.slice(0, 8);
  }
}
