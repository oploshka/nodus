import type { EngineDsl } from './EngineDsl.js';
import type { tEngineStepContext } from './EngineStepContext.js';
import type { iEngineStep } from './EngineStepInterface.js';

export type tEnginePointContext = Record<string, unknown>;
export type tEnginePointContextFactory = (input: unknown) => tEnginePointContext;

export type tEnginePointResponse = (
  result: unknown,
  dsl: EngineDsl,
  context: tEnginePointContext,
  stepContext: tEngineStepContext,
) => Promise<unknown>;

export interface sEnginePointConfig {
  step: iEngineStep;
  createContext?: tEnginePointContextFactory;
  response?: tEnginePointResponse;
}

/** A Step bound to one concrete point inside its parent Step flow. */
export class EnginePoint {
  public readonly step: iEngineStep;
  public readonly response?: tEnginePointResponse;

  private readonly contextFactory: tEnginePointContextFactory;

  public constructor(config: sEnginePointConfig) {
    this.step = config.step;
    this.contextFactory = config.createContext ?? (() => ({}));
    this.response = config.response;
  }

  /** Creates mutable state for this Point inside one parent Step execution. */
  public createContext(input: unknown): tEnginePointContext {
    return this.contextFactory(input);
  }
}
