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
 * Common description of one node in an Engine schema.
 *
 * A node is either a concrete module step (`module`) or a structural
 * `SEQUENCE` (`type` + `steps`). Runtime result handling does not add another
 * schema shape: a Step may return data or a new EngineSchema independently.
 */
export interface sEngineSchemaStep {
  task?: unknown;
  input?: sEngineStepInput;
  output?: sEngineOutput;
  transition?: tEngineTransition;
  module?: string;
  type?: ENGINE_STEP.SEQUENCE;
  steps?: sEngineSchemaStep[];
}

/** Runtime narrowing for a concrete module step. */
export type sEngineModuleStep = sEngineSchemaStep & {
  module: string;
  type?: never;
  steps?: never;
};

/** Runtime narrowing for the structural SEQUENCE primitive. */
export type sEngineSequence = sEngineSchemaStep & {
  type: ENGINE_STEP.SEQUENCE;
  module?: never;
  steps: sEngineSchemaStep[];
};

export type tEngineSchemaStep = sEngineSchemaStep;
export type tEngineTransition = (sequence: sEngineSequence, stepNumber: number) => void;

export function isEngineSequence(step: sEngineSchemaStep): step is sEngineSequence {
  return step.type === ENGINE_STEP.SEQUENCE;
}

export function isEngineModuleStep(step: sEngineSchemaStep): step is sEngineModuleStep {
  return typeof step.module === 'string' && step.module.length > 0;
}
