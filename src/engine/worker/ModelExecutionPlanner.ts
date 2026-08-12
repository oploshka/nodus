import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { ExecutionPlannerResponseFormatter } from '../../model/Response/ExecutionPlannerResponseFormatter.js';
import type { ExecutionAction } from './action/ExecutionAction.js';
import type { ExecutionDecision, ExecutionPlanner } from './ExecutionPlanner.js';
import type { ExecutionState } from './ExecutionState.js';

export class ModelExecutionPlanner implements ExecutionPlanner {
  private readonly formatter = new ExecutionPlannerResponseFormatter();

  public constructor(private readonly model: ModelRunner) {}

  public async next(state: ExecutionState, actions: ReadonlyArray<ExecutionAction>): Promise<ExecutionDecision> {
    const history = state.history.map((entry, index) => [
      `${index + 1}. ACTION ${entry.actionId}`,
      `INPUT ${JSON.stringify(entry.input)}`,
      `RESULT ${entry.result.status}: ${entry.result.summary}`,
      entry.result.data !== undefined ? `DATA ${JSON.stringify(entry.result.data)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    const actionList = actions.map((action) => `- ${action.id}: ${action.description}`).join('\n');
    const response = await this.model.run({
      maxTokens: 1024,
      formatter: this.formatter,
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
            this.formatter.instructions(),
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

    return response.output;
  }
}
