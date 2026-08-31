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

/**
 * One uniform node of an Engine execution schema.
 *
 * `module` describes the Step handler for this node.
 * `steps` describes the following local chain; `null` explicitly means that
 * this node has no child chain.
 */
export interface sEngineSchemaStep {
  type: ENGINE_STEP.SEQUENCE;
  data?: unknown;
  input?: sEngineStepInput;
  output?: sEngineOutput;
  transition?: tEngineTransition;
  module?: string;
  steps: sEngineSchemaStep[] | null;
}

export type tEngineTransition = (sequence: sEngineSchemaStep, stepNumber: number) => void;
