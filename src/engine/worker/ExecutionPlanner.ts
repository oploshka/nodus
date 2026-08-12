import type { ExecutionAction } from './action/ExecutionAction.js';
import type { ExecutionState } from './ExecutionState.js';

export type ExecutionDecision =
  | { type: 'action'; actionId: string; input: unknown }
  | { type: 'completed'; summary: string }
  | { type: 'failed'; reason: string };

export interface ExecutionPlanner {
  next(state: ExecutionState, actions: ReadonlyArray<ExecutionAction>): Promise<ExecutionDecision>;
}
