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

export interface iEngineStep {
  getId(): string | undefined;
  getGroup(): string;
  getMetadata(): sEngineStepMetadata;
  run(input: unknown, dependencies: tEngineRunDependencies): unknown | Promise<unknown>;
}
