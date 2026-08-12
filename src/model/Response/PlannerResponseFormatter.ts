import { ModelResponseFormatError, type ModelResponseFormatter } from './ModelResponseFormatter.js';

export interface PlannerStepResponse {
  id: string;
  goal: string;
  constraints: string[];
  knowledgeImpact: string[];
}

export interface PlannerModelResponse {
  steps: PlannerStepResponse[];
}

export class PlannerResponseFormatter implements ModelResponseFormatter<PlannerModelResponse> {
  public readonly id = 'planner';

  public instructions(): string {
    return [
      'Return protocol:',
      'STEP <id>',
      'GOAL <one-line semantic goal>',
      'CONSTRAINT <one-line constraint>  (repeat as needed)',
      'IMPACTS <optional knowledge area that may become stale>  (repeat as needed)',
      'END',
      'Repeat STEP..END for each step.',
    ].join('\n');
  }

  public parse(content: string): PlannerModelResponse {
    const lines = content.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
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
    if (valid.length === 0) {
      throw new ModelResponseFormatError(this.id, 'Planner returned no valid steps', content.slice(0, 500));
    }
    return { steps: valid };
  }
}
