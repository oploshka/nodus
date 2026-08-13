import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { QueueModelAdapter } from '@test-framework/ModelHarness.js';
import { runScenario } from '@test-framework/ScenarioRunner.js';
import { statusScenario } from '@test/integration/status/status.scenario.js';

describe('todo priority vertical slice', () => {
  it('uses an isolated copy of target/project across research and a three-file edit', async () => {
    const result = await runScenario(statusScenario);
    try {
      expect(result.run.status).toBe('completed');
      expect(result.run.steps[0].workerId).toBe('code');
      expect(await result.project.read('src/Todo.ts')).toContain("TodoPriority = 'low' | 'normal' | 'high'");
      expect(await result.project.read('src/TodoService.ts')).toContain("priority: TodoPriority = 'normal'");
      expect(await result.project.read('src/formatTodo.ts')).toContain('[${todo.priority}]');

      const model = result.model as QueueModelAdapter;
      expect(model.requests).toHaveLength(8);
      expect(model.remainingResponses).toBe(0);
      const log = await readFile(result.logger.path, 'utf8');
      expect(log).toContain('research.miss');
      expect(log).toContain('research.resolved');
      expect(log).not.toContain('worker.action.error');
      expect(log).not.toContain('engine.edit.error');
    } finally {
      await result.dispose();
    }
  });
});
