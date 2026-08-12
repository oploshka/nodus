import { ModelResponseFormatError, type ModelResponseFormatter } from './ModelResponseFormatter.js';

export type ExecutionPlannerModelResponse =
  | { type: 'action'; actionId: string; input: unknown }
  | { type: 'completed'; summary: string }
  | { type: 'failed'; reason: string };

export class ExecutionPlannerResponseFormatter implements ModelResponseFormatter<ExecutionPlannerModelResponse> {
  public readonly id = 'execution-planner';

  public instructions(): string {
    return [
      'To call an action return exactly:',
      'ACTION <action-id>',
      'INPUT <single-line JSON object>',
      '',
      'When the semantic step is complete return:',
      'STATUS completed',
      'SUMMARY <one line>',
      '',
      'If it cannot be completed with available actions return:',
      'STATUS failed',
      'REASON <one line>',
    ].join('\n');
  }

  public parse(content: string): ExecutionPlannerModelResponse {
    const normalized = content.replace(/\r\n/g, '\n');
    const status = normalized.match(/^STATUS\s+(completed|failed)\s*$/mi)?.[1]?.toLowerCase();
    if (status === 'completed') {
      return { type: 'completed', summary: normalized.match(/^SUMMARY\s+(.+)$/mi)?.[1]?.trim() ?? 'Step completed' };
    }
    if (status === 'failed') {
      return { type: 'failed', reason: normalized.match(/^REASON\s+(.+)$/mi)?.[1]?.trim() ?? 'Execution planner failed the step' };
    }

    const actionId = normalized.match(/^ACTION\s+(.+)$/mi)?.[1]?.trim();
    const inputRaw = normalized.match(/^INPUT\s+(.+)$/mi)?.[1]?.trim();
    if (!actionId || !inputRaw) {
      throw new ModelResponseFormatError(this.id, 'Expected ACTION/INPUT or STATUS result', content.slice(0, 500));
    }

    let input: unknown;
    try { input = JSON.parse(inputRaw); }
    catch {
      throw new ModelResponseFormatError(this.id, `INPUT must be single-line JSON: ${inputRaw}`, content.slice(0, 500));
    }
    return { type: 'action', actionId, input };
  }
}
