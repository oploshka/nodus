import test from 'node:test';
import { statusModelScenario } from '@test/model/scenario/status.schema';
import { testStep } from '@test/model/support/ScenarioRunner';

test('status scenario steps', { timeout: 360_000 }, async (suite) => {
  for (let step = 1; step <= statusModelScenario.plan.steps.length; step += 1) {
    const definition = statusModelScenario.plan.steps[step - 1];
    await suite.test(`status step ${step}: ${definition.type}`, { timeout: 180_000 }, async () => {
      await testStep(statusModelScenario, step);
    });
  }
});
