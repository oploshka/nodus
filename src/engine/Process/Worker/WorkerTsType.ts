import type { sProcessExecutionContext, sProcessSchema, tProcessModuleResult } from '@engine/Process/ProcessTsType.js';

export const WORKER_IMPLEMENTATION = {
  SCHEMA: 'SCHEMA',
  METHOD: 'METHOD',
} as const;

export type pWorkerImplementation = typeof WORKER_IMPLEMENTATION[keyof typeof WORKER_IMPLEMENTATION];

/** A Worker-owned local Process schema. Core remains the only schema executor. */
export interface sWorkerSchema extends sProcessSchema {}

export interface sWorkerRequest {
  task: string;
  context: sProcessExecutionContext;
}

export type tWorkerResult = tProcessModuleResult;
export type tWorkerMethod = (request: sWorkerRequest) => Promise<tWorkerResult>;

export type tWorkerImplementation =
  | {
      type: typeof WORKER_IMPLEMENTATION.SCHEMA;
      schema: sWorkerSchema;
    }
  | {
      type: typeof WORKER_IMPLEMENTATION.METHOD;
      method: tWorkerMethod;
    };

/** Automation-facing Worker contract. Concrete Workers choose schema or method execution. */
export interface iWorkerModule {
  getId(): string;
  getImplementation(): tWorkerImplementation;
}
