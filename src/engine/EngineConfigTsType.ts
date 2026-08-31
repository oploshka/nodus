import type { sEngineGroupConfig } from './Core/EngineRuntimeTsType.js';
import type { tEngineStepDefinition } from './Core/EngineStepInterface.js';

/** Public Engine runtime configuration. */
export interface sEngineConfig {
  readonly groups: Readonly<Record<string, sEngineGroupConfig>>;
  readonly modules: Readonly<Record<string, tEngineStepDefinition>>;
}
