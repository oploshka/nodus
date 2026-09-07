import type { EngineDsl } from './EngineDsl.js';
import type { tEngineStepContext } from './EngineStepContext.js';
import type { iEngineStep } from './EngineStepInterface.js';

export type tEnginePointContext = Record<string, unknown>;

export interface sEnginePointContextFactoryContext {
  input: unknown;
  stepContext: tEngineStepContext;
}

export type tEnginePointContextFactory = (
  context: sEnginePointContextFactoryContext,
) => tEnginePointContext;

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

/** An option whose availability predicate has already been resolved by Runtime. */
export interface sEnginePointResolvedOption {
  point: EnginePoint;
}

export type tEnginePointOptionsFactory = () => readonly sEnginePointOption[];

export interface sEnginePointInputContext {
  input: unknown;
  context: tEnginePointContext;
  stepContext: tEngineStepContext;
  available: readonly sEnginePointResolvedOption[];
}

export type tEnginePointInputFactory = (
  context: sEnginePointInputContext,
) => unknown;

export interface sEnginePointResponseContext {
  result: unknown;
  dsl: EngineDsl;
  context: tEnginePointContext;
  stepContext: tEngineStepContext;
  available: readonly sEnginePointResolvedOption[];
}

export type tEnginePointResponse = (
  context: sEnginePointResponseContext,
) => unknown | Promise<unknown>;

export interface sEnginePointConfig {
  name?: string;
  step: iEngineStep;
  options?: tEnginePointOptionsFactory;
  input?: tEnginePointInputFactory;
  createContext?: tEnginePointContextFactory;
  response?: tEnginePointResponse;
}

/** A child Step binding and its local rules inside a parent Step schema. */
export class EnginePoint {
  public readonly name?: string;
  public readonly step: iEngineStep;
  public readonly response?: tEnginePointResponse;

  private readonly optionsFactory: tEnginePointOptionsFactory;
  private readonly inputFactory?: tEnginePointInputFactory;
  private readonly contextFactory: tEnginePointContextFactory;

  public constructor(config: sEnginePointConfig) {
    this.name = config.name;
    this.step = config.step;
    this.optionsFactory = config.options ?? (() => []);
    this.inputFactory = config.input;
    this.contextFactory = config.createContext ?? (() => ({}));
    this.response = config.response;
  }

  /** Returns transitions declared by this Point schema. */
  public getOptions(): readonly sEnginePointOption[] {
    return this.optionsFactory();
  }

  /** Builds the input passed to the child Step for one Point invocation. */
  public createInput(context: sEnginePointInputContext): unknown {
    if (!this.inputFactory) return context.input;
    return this.inputFactory(context);
  }

  /** Creates mutable Point state owned by one parent Step execution. */
  public createContext(context: sEnginePointContextFactoryContext): tEnginePointContext {
    return this.contextFactory(context);
  }
}
