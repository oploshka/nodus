import type { sCoreOutput, sCoreSequence } from './CoreSchema.js';
import { CORE_MODULE_RESULT, CORE_STEP } from './CoreSchema.js';

export interface sCoreStepRef {
  number: number;
  output: sCoreOutput;
}

export interface sCoreExecutionContext {
  parent?: unknown;
  previous?: sCoreOutput;
  steps: readonly sCoreStepRef[];
  step: number;
  path: readonly number[];
}

export interface sCoreModuleRequest {
  task: unknown;
  context: sCoreExecutionContext;
}

export type tCoreModuleResult =
  | {
      type: CORE_MODULE_RESULT.OUTPUT;
      output: sCoreOutput;
    }
  | {
      type: CORE_MODULE_RESULT.SCHEMA;
      schema: sCoreSequence;
    };

export interface iCoreModule {
  readonly group: string;
  execute(request: sCoreModuleRequest): Promise<tCoreModuleResult>;
}

export type tCoreModuleConstructor = new () => iCoreModule;
export type tCoreModuleDefinition = iCoreModule | tCoreModuleConstructor;

export interface sCoreGroupSchemaConfig {
  readonly allowedGroups: readonly string[];
}

export interface sCoreGroupConfig {
  readonly schema: false | sCoreGroupSchemaConfig;
}

export interface sCoreConfig {
  readonly start: tCoreModuleDefinition;
  readonly groups: Readonly<Record<string, sCoreGroupConfig>>;
  readonly modules: Readonly<Record<string, tCoreModuleDefinition>>;
}

export interface sCoreTraceEntry {
  path: readonly number[];
  module?: string;
  type?: CORE_STEP.SEQUENCE;
  status: 'STARTED' | sCoreOutput['status'];
}

export interface sCoreRunResult {
  status: sCoreOutput['status'];
  output: sCoreOutput;
  schema: sCoreSequence;
  trace: readonly sCoreTraceEntry[];
  reason?: string;
}

export interface sCoreRegisteredModule {
  name: string;
  definition: tCoreModuleDefinition;
  module: iCoreModule;
}
