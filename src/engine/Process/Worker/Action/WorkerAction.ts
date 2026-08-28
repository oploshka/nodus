import type { ModelRunSettings } from '@model/Request/ModelRun.js';
import type { Presentation } from '@engine/Presentation/Presentation.js';

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
  /** Presentation owns semantic name, color and optional strategy detail. */
  readonly presentation: Presentation<any>;
  /** Compatibility aliases; presentation is the source of truth. */
  readonly name?: string;
  readonly method?: string;
  readonly description: string;
  run(input: TInput): Promise<ActionResult<TData, TRequest>>;
}
