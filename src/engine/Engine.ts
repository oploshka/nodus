import { CoreRuntime } from './Core/CoreRuntime.js';
import type { sCoreConfig, sCoreRunResult, tCoreRunDependencies } from './Core/CoreTsType.js';

/** Public entry point for the configurable Core orchestration runtime. */
export class Engine {
  private readonly runtime: CoreRuntime;

  public constructor(config: sCoreConfig) {
    this.runtime = new CoreRuntime(config);
  }

  public run(input: unknown, dependencies: tCoreRunDependencies = {}): Promise<sCoreRunResult> {
    return this.runtime.run(input, dependencies);
  }
}
