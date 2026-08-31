import type { EngineTestCommandConfiguration } from '@engine/EngineTest/CommandEngineTest.js';

export interface EngineTestConfiguration {
  /** Run project typecheck after accumulated Edit is applied. */
  typecheck?: EngineTestCommandConfiguration | false;
  /** Run project unit tests after accumulated Edit is applied. */
  unit?: EngineTestCommandConfiguration | false;
}
