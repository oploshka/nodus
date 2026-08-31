import type { EngineSchema } from './EngineSchema.js';
import type { sEngineEvent, sEngineOutput, sEngineSchemaStep } from './EngineSchemaTsType.js';

/** Runtime-only application dependencies. They are never written into schema/context. */
export type tEngineRunDependencies = Readonly<Record<string, unknown>>;

export type tEngineStepRunResult = sEngineOutput | EngineSchema;

export type tEngineStepColor =
  | 'gray'
  | 'white'
  | 'cyan'
  | 'brightCyan'
  | 'magenta'
  | 'brightMagenta'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'brightGreen'
  | 'red';

export interface sEngineStepMetadata {
  code: string;
  title: string;
  description?: string;
  color: tEngineStepColor;
}

/** Event delivered to external subscribers. The event itself stays presentation-free. */
export interface sEngineEventEnvelope {
  event: sEngineEvent;
  path: readonly number[];
  module?: string;
  schemaStep?: sEngineSchemaStep;
  step?: iEngineStep;
}

export type tEngineEventListener = (event: sEngineEventEnvelope) => void;

export interface iEngineStep {
  getId(): string | undefined;
  getGroup(): string;
  getMetadata(): sEngineStepMetadata;
  getDependencies(): Readonly<Record<string, iEngineStep>>;
  run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<tEngineStepRunResult>;
}
