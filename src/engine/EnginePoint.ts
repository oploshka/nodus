import type { EngineDsl } from './EngineDsl.js';
import type { tEngineStepContext } from './EngineStepContext.js';
import type { iEngineStep } from './EngineStepInterface.js';

export type tEnginePointContext = Record<string, unknown>;
export type tEnginePointContextFactory = (input: unknown) => tEnginePointContext;

export interface sEnginePointAvailabilityContext {
  context: tEnginePointContext;
  stepContext: tEngineStepContext;
  nextPoint: EnginePoint;
  nextContext?: tEnginePointContext;
}

export type tEnginePointAvailable = (
  context: sEnginePointAvailabilityContext,
) => boolean;

export interface sEnginePointOption {
  point: EnginePoint;
  available?: tEnginePointAvailable;
}

export type tEnginePointOptionsFactory = () => readonly sEnginePointOption[];

export type tEnginePointResponse = (
  result: unknown,
  dsl: EngineDsl,
  context: tEnginePointContext,
  stepContext: tEngineStepContext,
) => Promise<unknown>;

export interface sEnginePointConfig {
  name?: string;
  step: iEngineStep;
  options?: tEnginePointOptionsFactory;
  createContext?: tEnginePointContextFactory;
  response?: tEnginePointResponse;
}

/** A Step bound to one concrete point inside its parent Step flow. */
export class EnginePoint {
  public readonly name?: string;
  public readonly step: iEngineStep;
  public readonly response?: tEnginePointResponse;

  private readonly optionsFactory: tEnginePointOptionsFactory;
  private readonly contextFactory: tEnginePointContextFactory;

  public constructor(config: sEnginePointConfig) {
    this.name = config.name;
    this.step = config.step;
    this.optionsFactory = config.options ?? (() => []);
    this.contextFactory = config.createContext ?? (() => ({}));
    this.response = config.response;
  }

  /** Returns Points this binding may expose as next options. */
  public getOptions(): readonly sEnginePointOption[] {
    return this.optionsFactory();
  }

  /** Creates mutable state for this Point inside one parent Step execution. */
  public createContext(input: unknown): tEnginePointContext {
    return this.contextFactory(input);
  }
}
