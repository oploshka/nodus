import type { EngineSchema } from './EngineSchema.js';
import type { sEngineOutput } from './EngineSchemaTsType.js';

export interface sEngineStepRef {
  number: number;
  output: sEngineOutput;
}

export interface sEngineExecutionContext {
  parent?: unknown;
  previous?: sEngineOutput;
  steps: readonly sEngineStepRef[];
  step: number;
  path: readonly number[];
}

export interface sEngineStepRequest {
  task: unknown;
  context: sEngineExecutionContext;
}

/** Runtime-only application dependencies. They are never written into schema/context. */
export type tEngineRunDependencies = Readonly<Record<string, unknown>>;

export type tEngineStepRunResult = sEngineOutput | EngineSchema;

export type tEngineStepConstructor = new () => iEngineStep;
export type tEngineStepDefinition = iEngineStep | tEngineStepConstructor;

export interface iEngineStep {
  getId(): string | undefined;
  getGroup(): string;
  getDependencies(): Readonly<Record<string, tEngineStepDefinition>> | undefined;
  run(
    request: sEngineStepRequest,
    dependencies: tEngineRunDependencies,
  ): tEngineStepRunResult | Promise<tEngineStepRunResult>;
}
