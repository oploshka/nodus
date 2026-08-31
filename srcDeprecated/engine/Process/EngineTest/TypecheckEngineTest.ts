import { CommandEngineTest, type EngineTestCommandConfiguration } from '@engine/EngineTest/CommandEngineTest.js';

export class TypecheckEngineTest extends CommandEngineTest {
  public readonly id = 'typecheck';

  public constructor(projectRoot: string, configuration: EngineTestCommandConfiguration) {
    super(projectRoot, configuration);
  }
}
