export enum ENGINE_STEP {
  SEQUENCE = 'SEQUENCE',
}

export interface sEngineOutput {
  status: 'SUCCESS' | 'FAILURE';
  value?: unknown;
  reason?: string;
}

export interface sEngineContextConfig {
  parent?: boolean;
  previous?: boolean;
  steps?: readonly number[];
}

export interface sEngineStepInput {
  context?: sEngineContextConfig;
}

export interface sEngineComputedContext {
  parent?: unknown;
  previous?: sEngineSchemaStep;
  steps: readonly sEngineSchemaStep[];
}

export interface sEngineEvent {
  type: string;
  level?: 'info' | 'warning' | 'error';
  data?: unknown;
}

export type tEngineEmit = (event: sEngineEvent) => void;

/** Removable execution-only state. Engine can rebuild it from the working schema. */
export interface sEngineSchemaRuntimeStep {
  context?: sEngineComputedContext;
  events: sEngineEvent[];
}

/**
 * One uniform node of an Engine execution schema.
 *
 * `module` describes the Step handler for this node.
 * `task` describes the primary semantic task for this node.
 * `steps` describes a nested local chain; `null` explicitly means that
 * this node has no child chain.
 * `runtime` contains removable execution-only state such as resolved context
 * and events. Step output remains part of the working schema itself.
 */
export interface sEngineSchemaStep {
  type: ENGINE_STEP.SEQUENCE;
  task?: unknown;
  input?: sEngineStepInput;
  runtime?: sEngineSchemaRuntimeStep;
  output?: sEngineOutput;
  transition?: tEngineTransition;
  module?: string;
  steps: sEngineSchemaStep[] | null;
}

export type tEngineTransition = (sequence: sEngineSchemaStep[], stepNumber: number) => void;
