import type { EngineTest, EngineTestContext, EngineTestResult } from '@engine/EngineTest/EngineTest.js';

/** Explicit no-op EngineTest for projects that do not configure project-level checks. */
export class ResolveEngineTest implements EngineTest {
  public async run(_context: EngineTestContext): Promise<EngineTestResult> {
    return { status: 'passed', tests: [] };
  }
}
