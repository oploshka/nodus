import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { QueueModelAdapter } from '@test/framework/ModelHarness.js';
import { runScenario } from '@test/framework/ScenarioRunner.js';
import { maxPlanStepsScenario } from '@test/integration/runtime/max-plan-steps.scenario.js';

describe('runtime maxPlanSteps vertical slice', () => {
  it('follows plan -> determine -> attempt -> research -> retry -> multi-file edit without contract failures', async () => {
    const result = await runScenario(maxPlanStepsScenario);
    try {
      expect(result.run.status).toBe('completed');
      expect(result.run.plan.steps).toHaveLength(1);
      expect(result.run.steps).toHaveLength(1);
      expect(result.run.steps[0].workerId).toBe('code');
      expect(result.run.steps[0].result.status).toBe('completed');

      expect(await result.project.read('src/engine/Planner/ModelPlanner.ts')).toContain('private readonly maxPlanSteps = 8');
      expect(await result.project.read('src/engine/Planner/ModelPlanner.ts')).toContain('slice(0, this.maxPlanSteps)');
      expect(await result.project.read('src/app/Bootstrap.ts')).toContain('configuration.runtime?.maxPlanSteps');
      expect(await result.project.read('nodus.config.example.json')).toContain('"maxPlanSteps": 8');

      const model = result.model as QueueModelAdapter;
      expect(model.requests).toHaveLength(9);
      expect(model.remainingResponses).toBe(0);

      const messages = model.requests.map((request) => request.messages.at(-1)?.content ?? '');
      expect(messages[0]).toContain('Split this user request');
      expect(messages[1]).toContain('Determine the best available option');
      expect(messages[2]).toContain('Attempt to complete the assigned PlanStep now');
      expect(messages[3]).toContain('Where is the current maxPlanSteps limit defined');
      expect(messages[4]).toContain('How does Bootstrap instantiate ModelPlanner');
      expect(messages[5]).toContain('Attempt to complete the assigned PlanStep now');

      const log = await readFile(result.logger.path, 'utf8');
      expect(log).toContain('research.miss');
      expect(log).toContain('research.resolved');
      expect(log).not.toContain('worker.attempt.error');
      expect(log).not.toContain('worker.edit.error');
    } finally {
      await result.dispose();
    }
  });
});
