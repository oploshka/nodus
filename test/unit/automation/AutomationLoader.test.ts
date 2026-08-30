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
  it('hydrates data definitions while preserving executable classes', async () => {
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
      class WorkerCode { getId() { return 'code'; } }
      class ReadAction { getId() { return 'read'; } }
      class PlannerModel {}
      class DetermineModel {}
      class ResearchModel {}

      export default {
        planners: {
          task: {
            id: 'task',
            plan: {
              prompt: new URL('./Planner/PlannerTask/PlannerTaskPrompt.md', import.meta.url),
              response: { id: 'task', format: 'json' }
            }
          },
          model: PlannerModel
        },
        qualifiers: {
          task: { id: 'task', options: ['SIMPLE', 'MULTI', 'PROCESS'] }
        },
        determine: {
          model: DetermineModel
        },
        research: {
          'bounded-model': ResearchModel
        },
        workers: {
          code: WorkerCode
        },
        actions: {
          read: ReadAction
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

    expect(typeof automation.planners.model).toBe('function');
    expect(typeof automation.determine.model).toBe('function');
    expect(typeof automation.research['bounded-model']).toBe('function');

    const WorkerCode = automation.workers.code as new () => { getId(): string };
    expect(typeof WorkerCode).toBe('function');
    expect(new WorkerCode().getId()).toBe('code');

    const ReadAction = automation.actions.read as new () => { getId(): string };
    expect(typeof ReadAction).toBe('function');
    expect(new ReadAction().getId()).toBe('read');
  });
});
