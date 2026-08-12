import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '../../model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '../../model/Response/ModelResponseFormat.js';
import { ExecutionPlannerResponseSchema } from '../../model/Response/schema/ExecutionPlannerResponseSchema.js';
import type { ExecutionAction } from './action/ExecutionAction.js';
import type { ExecutionDecision, ExecutionPlanner } from './ExecutionPlanner.js';
import type { ExecutionState } from './ExecutionState.js';

export class ModelExecutionPlanner implements ExecutionPlanner {
  private readonly schema = new ExecutionPlannerResponseSchema();

  public constructor(private readonly model: ModelRunner) {}

  public async next(state: ExecutionState, actions: ReadonlyArray<ExecutionAction>): Promise<ExecutionDecision> {
    const history = state.history.map((entry, index) => [
      `${index + 1}. ACTION ${entry.actionId}`,
      `INPUT ${JSON.stringify(entry.input)}`,
      `RESULT ${entry.result.status}: ${entry.result.summary}`,
      entry.result.data !== undefined ? `DATA ${JSON.stringify(entry.result.data)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    const actionList = actions.map((action) => `- ${action.id}: ${action.description}`).join('\n');
    const data = [
      `TASK\n${state.task.description}`,
      `\nSTEP\n${state.step.goal}`,
      state.step.constraints.length ? `\nCONSTRAINTS\n${state.step.constraints.map((value) => `- ${value}`).join('\n')}` : '',
      `\nAVAILABLE ACTIONS\n${actionList}`,
      history ? `\nACTION HISTORY\n${history}` : '\nACTION HISTORY\n<empty>',
    ].join('\n');

    const response = await this.model.run({
      request: {
        message: 'Choose the next concrete action for this one semantic plan step.',
        data,
        format: ModelRequestFormat.Text,
        guidance: [
          'You are ExecutionPlanner inside one Nodus worker.',
          'You may only choose from the supplied actions.',
          'Use research when implementation facts are missing. Do not repeatedly research facts already present in history.',
          'Do not invent an unavailable action.',
        ].join('\n'),
      },
      response: {
        format: ModelResponseFormat.Raw,
        schema: this.schema,
      },
      settings: { maxTokens: 1024 },
    });

    return response.output;
  }
}
