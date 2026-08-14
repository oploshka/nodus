import { CommandEngineTest, type EngineTestCommandConfiguration } from '@engine/EngineTest/CommandEngineTest.js';

export class UnitEngineTest extends CommandEngineTest {
  public readonly id = 'unit';

  public constructor(projectRoot: string, configuration: EngineTestCommandConfiguration) {
    super(projectRoot, configuration);
  }
}
