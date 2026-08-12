import type { EngineLogger } from '../EngineLogger.js';
import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { callModel } from '../../model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '../../model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '../../model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '../../model/Response/ModelResponseSchema.js';
import type { ExecutionAction } from './action/ExecutionAction.js';
import type { ExecutionDecision, ExecutionPlanner } from './ExecutionPlanner.js';
import type { ExecutionState } from './ExecutionState.js';

interface ExecutionPlannerModelResponse {
  status: 'action' | 'completed' | 'failed';
  actionId?: string;
  input?: unknown;
  summary?: string;
  reason?: string;
}

const executionPlannerSchema: ModelResponseSchema = {
  description: 'The next local execution decision for one plan step.',
  fields: {
    status: {
      type: 'option',
      description: 'Choose whether to run an action, finish the step, or report that it cannot be completed.',
      optionList: [
        { id: 'action', description: 'A concrete available action must run next.' },
        { id: 'completed', description: 'The semantic plan step is complete.' },
        { id: 'failed', description: 'The step cannot be completed with the available actions/state.' },
      ],
    },
    actionId: { type: 'string', optional: true, description: 'Required when status=action. Must be one of AVAILABLE ACTIONS.' },
    input: { type: 'any', optional: true, description: 'Action input object. Required when status=action.' },
    summary: { type: 'string', optional: true, description: 'Short completion summary when status=completed.' },
    reason: { type: 'string', optional: true, description: 'Short failure reason when status=failed.' },
  },
};

export class ModelExecutionPlanner implements ExecutionPlanner {
  public constructor(
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
  ) {}

  public async next(state: ExecutionState, actions: ReadonlyArray<ExecutionAction>): Promise<ExecutionDecision> {
    const history = state.history.map((entry, index) => ({
      index: index + 1,
      actionId: entry.actionId,
      input: entry.input,
      result: entry.result,
    }));

    const response = await callModel<ExecutionPlannerModelResponse>(this.model, this.logger, {
      request: {
        message: 'Choose the next concrete action for this one semantic plan step.',
        data: {
          task: state.task.description,
          step: state.step,
          availableActions: actions.map((action) => ({ id: action.id, description: action.description })),
          history,
        },
        format: ModelRequestFormat.Json,
        guidance: [
          'You are ExecutionPlanner inside one Nodus worker.',
          'You may only choose from the supplied actions.',
          'Use research when implementation facts are missing. Do not repeatedly research facts already present in history.',
          'Do not invent an unavailable action.',
          'When status=action, provide actionId and an input object.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: executionPlannerSchema },
      settings: { maxTokens: 1024 },
    });

    if (response.status === 'completed') return { type: 'completed', summary: response.summary ?? 'Step completed' };
    if (response.status === 'failed') return { type: 'failed', reason: response.reason ?? 'Execution planner failed the step' };
    if (!response.actionId) return { type: 'failed', reason: 'Execution planner returned action status without actionId' };
    return { type: 'action', actionId: response.actionId, input: response.input ?? {} };
  }
}
