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

/** A reusable executable process. Composite Steps return a Point; leaf Steps return a value. */
export interface iEngineStep {
  getId(): string | undefined;
  getGroup(): string;
  getMetadata(): sEngineStepMetadata;
  run(input: unknown, dependencies: tEngineRunDependencies): Promise<unknown>;
}
