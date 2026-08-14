import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { QueueModelAdapter } from '@test-framework/ModelHarness.js';
import { runScenario } from '@test-framework/ScenarioRunner.js';
import { maxPlanStepsScenario } from '@test/integration/runtime/max-plan-steps.scenario.js';

describe('todo title validation vertical slice', () => {
  it('copies the todo fixture and follows plan -> determine -> research -> retry -> multi-file edit', async () => {
    const result = await runScenario(maxPlanStepsScenario);
    try {
      expect(result.run.status).toBe('completed');
      expect(result.run.plan.steps).toHaveLength(1);
      expect(result.run.steps[0].workerId).toBe('code');
      expect(await result.project.read('src/TodoService.ts')).toContain('normalized.length > 80');
      expect(await result.project.read('test/TodoService.test.ts')).toContain("'x'.repeat(81)");
      expect(await result.project.read('src/TodoStore.ts')).toContain('export class TodoStore');

      const model = result.model as QueueModelAdapter;
      expect(model.requests).toHaveLength(7);
      expect(model.remainingResponses).toBe(0);
      const messages = model.requests.map((request) => request.messages.at(-1)?.content ?? '');
      expect(messages[2]).toContain('Determine the concrete project edits');
      expect(messages[3]).toContain('Where is todo title normalization');

      const log = await readFile(result.logger.path, 'utf8');
      expect(log).toContain('research.resolved');
      expect(log).not.toContain('worker.action.error');
      expect(log).not.toContain('engine.edit.error');
    } finally {
      await result.dispose();
    }
  });
});
