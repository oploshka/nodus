import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('AutomationLoader', () => {
  it('hydrates automation groups and modules while preserving executable classes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nodus-automation-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'Planner'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8');
    await writeFile(join(root, 'Planner', 'PlannerPrompt.md'), '# Planner\n\nPlan the task.\n', 'utf8');
    await writeFile(join(root, 'index.js'), `
      class PlannerModel {}
      class WorkerCode { run() { return 'ok'; } }

      const PlannerTask = {
        prompt: new URL('./Planner/PlannerPrompt.md', import.meta.url),
        response: { id: 'task', format: 'json' }
      };

      export default {
        groups: {
          planner: { schema: { allowedGroups: ['worker'] } },
          worker: { schema: false }
        },
        modules: {
          PlannerTask,
          PlannerModel,
          WorkerCode
        }
      };
    `, 'utf8');

    const automation = await AutomationLoader.load(root);
    const groups = automation.groups as Record<string, unknown>;
    const modules = automation.modules as Record<string, unknown>;
    const planner = modules.PlannerTask as { prompt?: unknown; response?: unknown };

    expect(groups).toEqual({
      planner: { schema: { allowedGroups: ['worker'] } },
      worker: { schema: false },
    });
    expect(planner.prompt).toBe('# Planner\n\nPlan the task.\n');
    expect(planner.response).toEqual({ id: 'task', format: 'json' });
    expect(typeof modules.PlannerModel).toBe('function');

    const WorkerCode = modules.WorkerCode as new () => { run(): string };
    expect(new WorkerCode().run()).toBe('ok');
  });
});
