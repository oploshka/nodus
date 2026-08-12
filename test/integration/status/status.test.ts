import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { QueueModelAdapter } from '../../framework/ModelHarness.js';
import { runScenario } from '../../framework/ScenarioRunner.js';
import { statusScenario } from './status.scenario.js';

describe('/status vertical slice', () => {
  it('crosses Engine -> Planner -> DefaultWorker -> Research/Edit actions', async () => {
    const result = await runScenario(statusScenario);
    try {
      expect(result.run.status).toBe('completed');
      expect(result.run.plan.steps).toHaveLength(1);
      expect(result.run.steps[0].result.state.history.map((entry) => entry.actionId)).toEqual(['research', 'edit-file']);

      const changed = await result.project.read('src/cli/Cli.ts');
      expect(changed).toMatch(/\/status/);
      expect(changed).toMatch(/configuration\.project\.id/);
      expect(changed).toMatch(/conversation\.id/);
      expect(changed).toMatch(/projectSession\.index\?\.files\.length/);
      expect(changed).not.toMatch(/scan\(|refresh\(/);

      const model = result.model as QueueModelAdapter;
      expect(model.requests).toHaveLength(6);
      expect(model.remainingResponses).toBe(0);

      const log = await readFile(result.logger.path, 'utf8');
      expect(log).toContain('test.scenario.start');
      expect(log).toContain('engine.task.start');
      expect(log).toContain('worker.action');
      expect(log).toContain('research.miss');
      expect(log).toContain('test.scenario.finish');
    } finally {
      await result.dispose();
    }
  });
});
