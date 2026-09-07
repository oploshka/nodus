import type { tEngineStepContext } from './EngineStepContext.js';

export type tEngineRunDependencies = Readonly<Record<string, unknown>>;

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

/** Shared Step schema contract. Composite Steps expose Points; leaf Steps may return a value directly. */
export interface iEngineStep {
  getId(): string | undefined;
  getGroup(): string;
  getMetadata(): sEngineStepMetadata;
  createContext(input: unknown): tEngineStepContext;
  run(
    input: unknown,
    dependencies: tEngineRunDependencies,
    context: tEngineStepContext,
  ): Promise<unknown>;
}
