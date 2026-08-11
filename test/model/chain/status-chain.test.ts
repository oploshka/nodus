import test from 'node:test';
import { statusModelScenario } from '@test/model/scenario/status.schema';
import { testChain } from '@test/model/support/ScenarioRunner';

test('status chain 1..5: retrieval -> understand', { timeout: 240_000 }, async () => {
  await testChain(statusModelScenario, 1, 5);
});

test('status chain 5..6: understand checkpoint -> prepare-change', { timeout: 180_000 }, async () => {
  await testChain(statusModelScenario, 5, 6);
});
