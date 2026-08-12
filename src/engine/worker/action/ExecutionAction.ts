import type { ExecutionState } from '../ExecutionState.js';

export interface ActionResult<T = unknown> {
  status: 'completed' | 'failed';
  summary: string;
  data?: T;
  fatal?: boolean;
}

export interface ExecutionActionContext {
  state: ExecutionState;
}

export interface ExecutionAction {
  readonly id: string;
  readonly description: string;
  readonly maxUses?: number;
  execute(input: unknown, context: ExecutionActionContext): Promise<ActionResult>;
}
