import { EngineRuntime } from './Core/EngineRuntime.js';
import { EngineSchema } from './Core/EngineSchema.js';
import type { sEngineRunResult } from './Core/EngineRuntimeTsType.js';
import type { tEngineRunDependencies } from './Core/EngineStepInterface.js';
import type { sEngineConfig } from './EngineConfigTsType.js';

/** Public entry point for the configurable Engine runtime. */
export class Engine {
  private readonly runtime: EngineRuntime;

  public constructor(config: sEngineConfig) {
    this.runtime = new EngineRuntime(config);
  }

  public run(schema: EngineSchema, dependencies: tEngineRunDependencies = {}): Promise<sEngineRunResult> {
    return this.runtime.run(schema, dependencies);
  }
}
