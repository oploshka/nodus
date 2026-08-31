import type { EngineSchema } from './EngineSchema.js';
import type { sEngineOutput, sEngineSchemaStep } from './EngineSchemaTsType.js';

/** Runtime-only application dependencies. They are never written into schema/context. */
export type tEngineRunDependencies = Readonly<Record<string, unknown>>;

export type tEngineStepRunResult = sEngineOutput | EngineSchema;

export interface iEngineStep {
  getId(): string | undefined;
  getGroup(): string;
  getDependencies(): Readonly<Record<string, iEngineStep>>;
  run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<tEngineStepRunResult>;
}
