import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { ExecutionAction } from '@engine/Worker/Action/ExecutionAction.js';
import { createExecutionState, type ExecutionState } from '@engine/Worker/ExecutionState.js';
import type { ExecutionPlanner } from '@engine/Worker/ExecutionPlanner.js';

export type WorkerResult =
  | { status: 'completed'; summary: string; state: ExecutionState }
  | { status: 'failed'; error: string; state: ExecutionState };

export class DefaultWorker {
  private readonly actions = new Map<string, ExecutionAction>();

  public constructor(
    private readonly planner: ExecutionPlanner,
    actions: ExecutionAction[],
    private readonly logger: EngineLogger,
    private readonly maxIterations = 8,
  ) {
    for (const action of actions) {
      if (this.actions.has(action.id)) throw new Error(`Duplicate action: ${action.id}`);
      this.actions.set(action.id, action);
    }
  }

  public async execute(task: Task, step: PlanStep): Promise<WorkerResult> {
    const state = createExecutionState(task, step);
    this.logger.info('worker.start', { taskId: task.id, stepId: step.id, actions: [...this.actions.keys()] });

    while (state.iteration < this.maxIterations) {
      state.iteration += 1;
      const decision = await this.planner.nextStep(state, [...this.actions.values()]);
      this.logger.info('worker.decision', { stepId: step.id, iteration: state.iteration, decision });
      if (decision.type === 'completed') {
        this.logger.info('worker.finish', { stepId: step.id, status: 'completed', summary: decision.summary });
        return { status: 'completed', summary: decision.summary, state };
      }
      if (decision.type === 'failed') {
        this.logger.warn('worker.finish', { stepId: step.id, status: 'failed', reason: decision.reason });
        return { status: 'failed', error: decision.reason, state };
      }

      const action = this.actions.get(decision.actionId);
      if (!action) return { status: 'failed', error: `Unknown execution action: ${decision.actionId}`, state };

      const used = state.history.filter((entry) => entry.actionId === action.id).length;
      if (action.maxUses !== undefined && used >= action.maxUses) {
        return { status: 'failed', error: `Execution action limit exceeded: ${action.id} (${action.maxUses})`, state };
      }

      this.logger.info('worker.action', { step: step.id, action: action.id, iteration: state.iteration });
      let result;
      try {
        result = await action.execute(decision.input, { state });
      } catch (error) {
        result = { status: 'failed' as const, summary: error instanceof Error ? error.message : String(error), fatal: false };
      }
      state.history.push({ actionId: action.id, input: decision.input, result });
      this.logger.info('worker.action.result', { stepId: step.id, action: action.id, iteration: state.iteration, result });
      if (result.status === 'failed' && result.fatal) {
        this.logger.warn('worker.finish', { stepId: step.id, status: 'failed', reason: result.summary });
        return { status: 'failed', error: result.summary, state };
      }
    }

    const error = `Worker iteration limit exceeded (${this.maxIterations})`;
    this.logger.warn('worker.finish', { stepId: step.id, status: 'failed', reason: error });
    return { status: 'failed', error, state };
  }
}
