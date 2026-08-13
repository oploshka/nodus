import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { QueueModelAdapter } from '../../../target/testFramework/ModelHarness.js';
import { runScenario } from '../../../target/testFramework/ScenarioRunner.js';
import { statusScenario } from '@test/integration/status/status.scenario.js';

describe('/status vertical slice', () => {
  it('crosses Engine -> Determine -> CodeWorker -> Research -> retry', async () => {
    const result = await runScenario(statusScenario);
    try {
      expect(result.run.status).toBe('completed');
      expect(result.run.plan.steps).toHaveLength(1);
      expect(result.run.steps[0].workerId).toBe('code');

      const changed = await result.project.read('src/Cli/Cli.ts');
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
      expect(log).toContain('engine.worker.selected');
      expect(log).toContain('worker.action.start');
      expect(log).toContain('worker.action.finish');
      expect(log).toContain('research.miss');
      expect(log).toContain('test.scenario.finish');
    } finally {
      await result.dispose();
    }
  });
});
