import type { sCoreGroupConfig, tCoreModuleDefinition } from './Core/CoreTsType.js';

/** Public Engine runtime configuration. */
export interface sEngineConfig {
  readonly groups: Readonly<Record<string, sCoreGroupConfig>>;
  readonly modules: Readonly<Record<string, tCoreModuleDefinition>>;
}
