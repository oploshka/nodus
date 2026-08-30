export enum CORE_STEP {
  SEQUENCE = 'SEQUENCE',
}

export enum CORE_MODULE_RESULT {
  OUTPUT = 'OUTPUT',
  SCHEMA = 'SCHEMA',
}

export interface sCoreOutput {
  status: 'SUCCESS' | 'FAILURE';
  value?: unknown;
  reason?: string;
}

export interface sCoreContextConfig {
  parent?: boolean;
  previous?: boolean;
  steps?: readonly number[];
}

export interface sCoreStepInput {
  context?: sCoreContextConfig;
}

export interface sCoreStepBase {
  task?: unknown;
  input?: sCoreStepInput;
  output?: sCoreOutput;
  transition?: tCoreTransition;
}

export interface sCoreModuleStep extends sCoreStepBase {
  module: string;
  schema?: sCoreSequence;
}

export interface sCoreSequence extends sCoreStepBase {
  type: CORE_STEP.SEQUENCE;
  steps: tCoreStep[];
}

export type tCoreStep = sCoreSequence | sCoreModuleStep;
export type tCoreTransition = (sequence: sCoreSequence, stepNumber: number) => void;

export function isCoreSequence(step: tCoreStep): step is sCoreSequence {
  return 'type' in step && step.type === CORE_STEP.SEQUENCE;
}
