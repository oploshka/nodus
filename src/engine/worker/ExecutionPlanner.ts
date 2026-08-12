import type { ExecutionAction } from './action/ExecutionAction.js';
import type { ExecutionState } from './ExecutionState.js';

/**
 * One locally planned execution step inside a Worker.
 *
 * ExecutionPlanner does not own the worker loop and does not execute anything.
 * It only decides what should happen next from the current state and the
 * actions that this Worker explicitly exposes.
 */
export type ExecutionStep =
  | { type: 'action'; actionId: string; input: unknown }
  | { type: 'completed'; summary: string }
  | { type: 'failed'; reason: string };

export interface ExecutionPlanner {
  nextStep(state: ExecutionState, actions: ReadonlyArray<ExecutionAction>): Promise<ExecutionStep>;
}
