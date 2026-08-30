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
  it('loads colocated module definitions and hydrates prompt file URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nodus-automation-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'Planner', 'PlannerTask'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8');
    await writeFile(
      join(root, 'Planner', 'PlannerTask', 'PlannerTaskPrompt.md'),
      '# PlannerTask\n\nPlan the task.\n',
      'utf8',
    );
    await writeFile(join(root, 'index.js'), `
      export default {
        planners: {
          task: {
            id: 'task',
            plan: {
              prompt: new URL('./Planner/PlannerTask/PlannerTaskPrompt.md', import.meta.url),
              response: { id: 'task', format: 'json' }
            }
          }
        },
        qualifiers: {
          task: { id: 'task', options: ['SIMPLE', 'MULTI', 'PROCESS'] }
        },
        workers: {
          code: { id: 'code', actions: ['read-file'] }
        }
      };
    `, 'utf8');

    const automation = await AutomationLoader.load(root);
    const planner = automation.planners.task as {
      plan?: { prompt?: unknown; response?: unknown };
    };

    expect(planner.plan?.prompt).toBe('# PlannerTask\n\nPlan the task.\n');
    expect(planner.plan?.response).toEqual({ id: 'task', format: 'json' });
    expect(automation.qualifiers.task).toEqual({
      id: 'task',
      options: ['SIMPLE', 'MULTI', 'PROCESS'],
    });
    expect(automation.workers.code).toEqual({ id: 'code', actions: ['read-file'] });
  });
});
