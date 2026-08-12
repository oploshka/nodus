import { ModelResponseFormatError, type ModelResponseSchema } from '../ModelResponseSchema.js';

export type ExecutionPlannerModelResponse =
  | { type: 'action'; actionId: string; input: unknown }
  | { type: 'completed'; summary: string }
  | { type: 'failed'; reason: string };

export class ExecutionPlannerResponseSchema implements ModelResponseSchema<ExecutionPlannerModelResponse> {
  public readonly id = 'execution-planner';

  public instructions(): string {
    return [
      'Expected raw schema for an action:',
      'ACTION <action-id>',
      'INPUT <single-line JSON object>',
      '',
      'Expected raw schema when complete:',
      'STATUS completed',
      'SUMMARY <one line>',
      '',
      'Expected raw schema when impossible:',
      'STATUS failed',
      'REASON <one line>',
    ].join('\n');
  }

  public decode(value: unknown): ExecutionPlannerModelResponse {
    if (typeof value !== 'string') this.fail('Expected raw text', value);
    const status = value.match(/^STATUS\s+(completed|failed)\s*$/mi)?.[1]?.toLowerCase();
    if (status === 'completed') {
      return { type: 'completed', summary: value.match(/^SUMMARY\s+(.+)$/mi)?.[1]?.trim() ?? 'Step completed' };
    }
    if (status === 'failed') {
      return { type: 'failed', reason: value.match(/^REASON\s+(.+)$/mi)?.[1]?.trim() ?? 'Execution planner failed the step' };
    }

    const actionId = value.match(/^ACTION\s+(.+)$/mi)?.[1]?.trim();
    const inputRaw = value.match(/^INPUT\s+(.+)$/mi)?.[1]?.trim();
    if (!actionId || !inputRaw) this.fail('Expected ACTION/INPUT or STATUS result', value);

    let input: unknown;
    try { input = JSON.parse(inputRaw); }
    catch { this.fail(`INPUT must be single-line JSON: ${inputRaw}`, value); }
    return { type: 'action', actionId, input };
  }

  private fail(message: string, value: unknown): never {
    throw new ModelResponseFormatError(this.id, message, String(value).slice(0, 500));
  }
}
