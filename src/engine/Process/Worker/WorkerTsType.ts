import type { sProcessExecutionContext, tProcessModuleResult } from '../ProcessTsType.js';

export interface sWorkerSchema {
  id: string;
  prompt?: string;
  response?: unknown;
  actions?: ReadonlyArray<string>;
  limits?: Readonly<Record<string, number>>;
}

export interface sWorkerRequest {
  task: string;
  context: sProcessExecutionContext;
}

export type tWorkerResult = tProcessModuleResult;
