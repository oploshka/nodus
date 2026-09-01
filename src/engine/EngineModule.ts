import type { EngineDsl } from './EngineDsl.js';
import type { iEngineStep } from './EngineStepInterface.js';

export type tEngineModuleContext = Record<string, unknown>;

export type tEngineModuleResponse = (
  result: unknown,
  dsl: EngineDsl,
) => void | Promise<void>;

export interface sEngineModuleConfig {
  dependency: iEngineStep;
  context?: tEngineModuleContext;
  response?: tEngineModuleResponse;
}

/** One dependency plus the local behavior that follows its result. */
export class EngineModule {
  public readonly dependency: iEngineStep;
  public readonly context: tEngineModuleContext;
  public readonly response?: tEngineModuleResponse;

  public constructor(config: sEngineModuleConfig) {
    this.dependency = config.dependency;
    this.context = config.context ?? {};
    this.response = config.response;
  }
}
