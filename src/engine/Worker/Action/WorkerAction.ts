import type { ModelRunSettings } from '@model/Request/ModelRun.js';

export interface ActionModelOptions {
  settings?: ModelRunSettings;
}

export interface ActionRequest<TInput = unknown> {
  actionId: string;
  input: TInput;
}

export type ActionResult<TData = unknown, TRequest = unknown> =
  | { status: 'completed'; data: TData }
  | { status: 'not-completed'; reason: string; canContinue: true; requests?: Array<ActionRequest<TRequest>> }
  | { status: 'failed'; reason: string; canContinue: false };

/** One bounded executable capability available to a Worker. */
export interface WorkerAction<TInput = unknown, TData = unknown, TRequest = unknown> {
  readonly id: string;
  readonly description: string;
  run(input: TInput): Promise<ActionResult<TData, TRequest>>;
}
