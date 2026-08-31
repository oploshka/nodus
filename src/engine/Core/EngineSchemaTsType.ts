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

export interface sEngineStepBase {
  task?: unknown;
  input?: sEngineStepInput;
  output?: sEngineOutput;
  transition?: tEngineTransition;
}

export interface sEngineModuleStep extends sEngineStepBase {
  module: string;
  schema?: sEngineSequence;
}

export interface sEngineSequence extends sEngineStepBase {
  type: ENGINE_STEP.SEQUENCE;
  steps: tEngineSchemaStep[];
}

export type tEngineSchemaStep = sEngineSequence | sEngineModuleStep;
export type tEngineTransition = (sequence: sEngineSequence, stepNumber: number) => void;

export function isEngineSequence(step: tEngineSchemaStep): step is sEngineSequence {
  return 'type' in step && step.type === ENGINE_STEP.SEQUENCE;
}
