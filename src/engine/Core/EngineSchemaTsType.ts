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

/**
 * One uniform node of an Engine execution schema.
 *
 * `module` describes the Step handler for this node.
 * `task` describes the primary semantic task for this node.
 * `steps` describes a nested local chain; `null` explicitly means that
 * this node has no child chain.
 * `computedContext` is runtime state resolved from `input.context` by EngineSchema.
 */
export interface sEngineSchemaStep {
  type: ENGINE_STEP.SEQUENCE;
  task?: unknown;
  input?: sEngineStepInput;
  computedContext?: sEngineComputedContext;
  output?: sEngineOutput;
  transition?: tEngineTransition;
  module?: string;
  steps: sEngineSchemaStep[] | null;
}

export type tEngineTransition = (sequence: sEngineSchemaStep[], stepNumber: number) => void;
