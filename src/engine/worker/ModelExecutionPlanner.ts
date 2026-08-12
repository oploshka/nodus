import type { ModelConfiguration } from '../../app/config/Configuration.js';
import type { ModelAdapter } from '../../model/Adapter/ModelAdapter.js';
import type { ExecutionAction } from './action/ExecutionAction.js';
import type { ExecutionDecision, ExecutionPlanner } from './ExecutionPlanner.js';
import type { ExecutionState } from './ExecutionState.js';

export class ModelExecutionPlanner implements ExecutionPlanner {
  public constructor(
    private readonly model: ModelAdapter,
    private readonly configuration: ModelConfiguration,
  ) {}

  public async next(state: ExecutionState, actions: ReadonlyArray<ExecutionAction>): Promise<ExecutionDecision> {
    const history = state.history.map((entry, index) => [
      `${index + 1}. ACTION ${entry.actionId}`,
      `INPUT ${JSON.stringify(entry.input)}`,
      `RESULT ${entry.result.status}: ${entry.result.summary}`,
      entry.result.data !== undefined ? `DATA ${JSON.stringify(entry.result.data)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    const actionList = actions.map((action) => `- ${action.id}: ${action.description}`).join('\n');
    const response = await this.model.complete({
      model: this.configuration.model,
      temperature: 0,
      maxTokens: Math.min(this.configuration.maxTokens ?? 4096, 1024),
      messages: [
        {
          role: 'system',
          content: [
            'You are ExecutionPlanner inside one Nodus worker.',
            'Your job is to choose the next concrete action required to complete ONE semantic plan step.',
            'You may only choose from the supplied actions.',
            'Use research when implementation facts are missing. Do not repeatedly research facts already present in history.',
            'Do not invent an unavailable action.',
            '',
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
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `TASK\n${state.task.description}`,
            `\nSTEP\n${state.step.goal}`,
            state.step.constraints.length ? `\nCONSTRAINTS\n${state.step.constraints.map((value) => `- ${value}`).join('\n')}` : '',
            `\nAVAILABLE ACTIONS\n${actionList}`,
            history ? `\nACTION HISTORY\n${history}` : '\nACTION HISTORY\n<empty>',
          ].join('\n'),
        },
      ],
    });

    return this.parse(response.content);
  }

  private parse(content: string): ExecutionDecision {
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
    if (!actionId || !inputRaw) throw new Error(`Invalid ExecutionPlanner response: ${content.slice(0, 500)}`);
    let input: unknown;
    try { input = JSON.parse(inputRaw); }
    catch { throw new Error(`ExecutionPlanner INPUT must be single-line JSON: ${inputRaw}`); }
    return { type: 'action', actionId, input };
  }
}
