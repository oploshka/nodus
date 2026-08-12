import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { ExecutionAction } from '@engine/Worker/Action/ExecutionAction.js';
import type { ExecutionPlanner, ExecutionStep } from '@engine/Worker/ExecutionPlanner.js';
import type { ExecutionState } from '@engine/Worker/ExecutionState.js';

interface ExecutionPlannerModelResponse {
  status: 'action' | 'completed' | 'failed';
  actionId?: string;
  input?: unknown;
  summary?: string;
  reason?: string;
}

export class ModelExecutionPlanner implements ExecutionPlanner {
  public constructor(
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
  ) {}

  public async nextStep(state: ExecutionState, actions: ReadonlyArray<ExecutionAction>): Promise<ExecutionStep> {
    const history = state.history.map((entry, index) => ({
      index: index + 1,
      actionId: entry.actionId,
      input: entry.input,
      result: entry.result,
    }));

    const response = await callModel<ExecutionPlannerModelResponse>(this.model, this.logger, {
      request: {
        message: 'Plan the next concrete execution step for this one semantic plan step.',
        data: {
          task: state.task.description,
          step: state.step,
          availableActions: actions.map((action) => ({
            id: action.id,
            description: action.description,
            maxUses: action.maxUses,
          })),
          history,
        },
        format: ModelRequestFormat.Json,
        guidance: [
          'You are ExecutionPlanner inside one Nodus DefaultWorker.',
          'Plan exactly one next execution step from the current state.',
          'You may only choose an action exposed in AVAILABLE ACTIONS.',
          'Use research only when a concrete implementation fact is still missing.',
          'Treat completed action results in history as available context; do not research the same fact repeatedly.',
          'Do not perform the action yourself and do not invent project APIs or files.',
          'When the semantic step is already satisfied by completed actions, return completed.',
          'When status=action, provide actionId and the input required by that action.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: this.schema(actions) },
      settings: { maxTokens: 1024 },
    });

    if (response.status === 'completed') return { type: 'completed', summary: response.summary ?? 'Step completed' };
    if (response.status === 'failed') return { type: 'failed', reason: response.reason ?? 'Execution planner failed the step' };
    if (!response.actionId) return { type: 'failed', reason: 'Execution planner returned action status without actionId' };
    return { type: 'action', actionId: response.actionId, input: response.input ?? {} };
  }

  /**
   * The allowed action ids are part of the response contract, not just prompt
   * prose. This keeps the planner bounded by the Worker configuration and lets
   * the common ModelResponseSchema reject an unavailable action before Worker
   * execution starts.
   */
  private schema(actions: ReadonlyArray<ExecutionAction>): ModelResponseSchema {
    return {
      description: 'One next local execution step for the current semantic PlanStep.',
      fields: {
        status: {
          type: 'option',
          description: 'Choose whether to execute one action, finish this PlanStep, or report that it cannot be completed.',
          optionList: [
            { id: 'action', description: 'Run one concrete available action next.' },
            { id: 'completed', description: 'The semantic PlanStep is complete.' },
            { id: 'failed', description: 'The PlanStep cannot be completed with the available actions and current state.' },
          ],
        },
        actionId: {
          type: 'option',
          optional: true,
          description: 'Required when status=action.',
          optionList: actions.map((action) => ({ id: action.id, description: action.description })),
        },
        input: { type: 'any', optional: true, description: 'Input object for the selected action. Required when status=action.' },
        summary: { type: 'string', optional: true, description: 'Short summary when status=completed.' },
        reason: { type: 'string', optional: true, description: 'Short reason when status=failed.' },
      },
    };
  }
}
