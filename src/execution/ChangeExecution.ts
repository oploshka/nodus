import type { ChangeExecutionContext } from '@execution/ChangeExecutionContext';
import type { FileChange } from '@execution/State/ChangeSet';
import { ChangeOptionResolver } from '@execution/Option/ChangeOption';
import {
  createChangeState,
  resetChangeForRetry,
  type ChangeFact,
  type ChangeState,
  type ChangeWorkItem,
} from '@execution/State/ChangeState';
import type { Worker } from '@execution/Worker/Worker';

export interface ChangeExecutionInput {
  work: ChangeWorkItem;
  facts: ChangeFact[];
  context: ChangeExecutionContext;
}

export interface ChangeProposalExecutionInput extends ChangeExecutionInput {
  proposal: FileChange[];
}

export type ChangeExecutionResult =
  | { status: 'completed'; state: ChangeState }
  | { status: 'failed'; state: ChangeState; error: string };

/**
 * Small constrained runtime for one prepared code-change work item.
 * Planner chooses the work. This runtime owns only how that work progresses:
 * State -> available Option -> Worker -> next State.
 */
export class ChangeExecution {
  private readonly workers = new Map<string, Worker<ChangeState, ChangeExecutionContext>>();

  public constructor(
    private readonly options: ChangeOptionResolver,
    workers: Array<Worker<ChangeState, ChangeExecutionContext>>,
  ) {
    for (const worker of workers) this.workers.set(worker.id, worker);
  }

  public async execute(input: ChangeExecutionInput): Promise<ChangeExecutionResult> {
    return this.run(createChangeState(input.work, input.facts), input.context);
  }

  public async executeProposal(input: ChangeProposalExecutionInput): Promise<ChangeExecutionResult> {
    const state: ChangeState = {
      ...createChangeState(input.work, input.facts),
      phase: 'proposed',
      attempt: 1,
      proposal: input.proposal,
    };
    return this.run(state, input.context);
  }

  private async run(initialState: ChangeState, context: ChangeExecutionContext): Promise<ChangeExecutionResult> {
    let state = initialState;

    while (state.phase !== 'completed' && state.phase !== 'failed') {
      const option = this.options.next(state);
      if (!option) {
        const error = state.lastError ?? `No execution option is available from phase ${state.phase}`;
        state = { ...state, phase: 'failed', lastError: error };
        return { status: 'failed', state, error };
      }

      const worker = this.workers.get(option.workerId);
      if (!worker) {
        const error = `Worker ${option.workerId} is not registered for option ${option.id}`;
        state = { ...state, phase: 'failed', lastError: error };
        return { status: 'failed', state, error };
      }

      if (option.id === 'propose-change') {
        state = { ...state, attempt: state.attempt + 1 };
      }

      try {
        const next = await worker.execute(state, context);
        state = {
          ...next,
          history: [...state.history, { option: option.id, worker: worker.id, ok: true }],
        };
      } catch (error) {
        // Transport errors intentionally escape. Planner owns pause/resume semantics.
        if (error instanceof Error && error.name === 'ModelTransportError') throw error;

        const message = error instanceof Error ? error.message : String(error);
        const failedEvent = { option: option.id, worker: worker.id, ok: false, error: message };
        state = { ...state, history: [...state.history, failedEvent], lastError: message };

        const canRetryProposal = option.id !== 'commit-candidate' && state.attempt < state.work.maxAttempts;
        if (canRetryProposal) {
          state = resetChangeForRetry(state, message);
          continue;
        }

        state = { ...state, phase: 'failed' };
        return { status: 'failed', state, error: message };
      }
    }

    return { status: 'completed', state };
  }
}
