import type { EngineTest, EngineTestContext, EngineTestResult, EngineTestRunResult } from '@engine/EngineTest/EngineTest.js';
import type { CommandEngineTest } from '@engine/EngineTest/CommandEngineTest.js';

export class CompositeEngineTest implements EngineTest {
  public constructor(private readonly tests: ReadonlyArray<CommandEngineTest>) {}

  public async run(context: EngineTestContext): Promise<EngineTestResult> {
    const results: EngineTestRunResult[] = [];
    for (const test of this.tests) results.push(await test.runOne(context));

    const failed = results.filter(
      (result): result is Extract<EngineTestRunResult, { status: 'failed' }> => result.status === 'failed',
    );
    if (failed.length === 0) return { status: 'passed', tests: results };

    return {
      status: 'failed',
      reason: failed.map((result) => `${result.id}: ${result.reason}`).join('\n'),
      tests: results,
    };
  }
}
