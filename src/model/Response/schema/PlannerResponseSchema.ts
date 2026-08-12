import { ModelResponseFormatError, type ModelResponseSchema } from '../ModelResponseSchema.js';

export interface PlannerStepResponse {
  id: string;
  goal: string;
  constraints: string[];
  knowledgeImpact: string[];
}

export interface PlannerModelResponse {
  steps: PlannerStepResponse[];
}

export class PlannerResponseSchema implements ModelResponseSchema<PlannerModelResponse> {
  public readonly id = 'planner';

  public instructions(): string {
    return [
      'Expected raw schema:',
      'STEP <id>',
      'GOAL <one-line semantic goal>',
      'CONSTRAINT <one-line constraint>  (repeat as needed)',
      'IMPACTS <optional knowledge area that may become stale>  (repeat as needed)',
      'END',
      'Repeat STEP..END for each step.',
    ].join('\n');
  }

  public decode(value: unknown): PlannerModelResponse {
    if (typeof value !== 'string') this.fail('Expected raw text', value);
    const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
    const steps: PlannerStepResponse[] = [];
    let current: PlannerStepResponse | undefined;

    for (const line of lines) {
      if (line.startsWith('STEP ')) {
        if (current) steps.push(current);
        current = { id: line.slice(5).trim(), goal: '', constraints: [], knowledgeImpact: [] };
        continue;
      }
      if (!current) continue;
      if (line.startsWith('GOAL ')) current.goal = line.slice(5).trim();
      else if (line.startsWith('CONSTRAINT ')) current.constraints.push(line.slice(11).trim());
      else if (line.startsWith('IMPACTS ')) current.knowledgeImpact.push(line.slice(8).trim());
      else if (line === 'END') { steps.push(current); current = undefined; }
    }
    if (current) steps.push(current);

    const valid = steps.filter((step) => step.id && step.goal).slice(0, 8);
    if (valid.length === 0) this.fail('Planner returned no valid steps', value);
    return { steps: valid };
  }

  private fail(message: string, value: unknown): never {
    throw new ModelResponseFormatError(this.id, message, String(value).slice(0, 500));
  }
}
