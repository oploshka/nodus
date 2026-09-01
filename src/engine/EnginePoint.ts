import type { EngineDsl } from './EngineDsl.js';
import type { iEngineStep } from './EngineStepInterface.js';

export type tEnginePointContext = Record<string, unknown>;

export type tEnginePointResponse = (
  result: unknown,
  dsl: EngineDsl,
) => Promise<unknown>;

export interface sEnginePointConfig {
  step: iEngineStep;
  context?: tEnginePointContext;
  response?: tEnginePointResponse;
}

/** A Step bound to one concrete point inside its parent Step flow. */
export class EnginePoint {
  public readonly step: iEngineStep;
  public readonly context: tEnginePointContext;
  public readonly response?: tEnginePointResponse;

  public constructor(config: sEnginePointConfig) {
    this.step = config.step;
    this.context = config.context ?? {};
    this.response = config.response;
  }
}
