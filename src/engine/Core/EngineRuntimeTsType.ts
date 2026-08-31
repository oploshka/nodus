import { ENGINE_STEP, type sEngineOutput } from './EngineSchemaTsType.js';
import type { EngineSchema } from './EngineSchema.js';
import type { iEngineStep, tEngineStepDefinition } from './EngineStepInterface.js';

export interface sEngineGroupSchemaConfig {
  readonly allowedGroups: readonly string[];
}

export interface sEngineGroupConfig {
  readonly schema: false | sEngineGroupSchemaConfig;
}

export interface sEngineTraceEntry {
  path: readonly number[];
  module?: string;
  type?: ENGINE_STEP.SEQUENCE;
  status: 'STARTED' | sEngineOutput['status'];
}

export interface sEngineRunResult {
  status: sEngineOutput['status'];
  output: sEngineOutput;
  schema: EngineSchema;
  trace: readonly sEngineTraceEntry[];
  reason?: string;
}

export interface sEngineRegisteredModule {
  name: string;
  definition: tEngineStepDefinition;
  module: iEngineStep;
}
