import { CoreRuntime } from './Core/CoreRuntime.js';
import type { sCoreRunResult, tCoreRunDependencies } from './Core/CoreTsType.js';
import type { sCoreSequence } from './Core/CoreSchema.js';
import type { sEngineConfig } from './EngineConfigTsType.js';

/** Public entry point for the configurable Core orchestration runtime. */
export class Engine {
  private readonly runtime: CoreRuntime;

  public constructor(config: sEngineConfig) {
    this.runtime = new CoreRuntime(config);
  }

  public run(schema: sCoreSequence, dependencies: tCoreRunDependencies = {}): Promise<sCoreRunResult> {
    return this.runtime.run(schema, dependencies);
  }
}
