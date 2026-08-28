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
  it('loads js definitions and keeps markdown prompt text separate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nodus-automation-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'prompts'));
    await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8');
    await writeFile(join(root, 'prompts', 'planner.md'), '# Planner\n\nPlan the task.\n', 'utf8');
    await writeFile(join(root, 'index.js'), `
      export default {
        prompts: { planner: 'prompts/planner.md' },
        schemas: {
          simple: {
            kind: 'sequence',
            id: 'simple',
            variables: ['task'],
            steps: []
          }
        },
        workers: { code: { id: 'code', prompt: 'worker-code' } }
      };
    `, 'utf8');

    const automation = await AutomationLoader.load(root);

    expect(automation.prompts.planner).toBe('# Planner\n\nPlan the task.\n');
    expect(automation.schemas.simple.id).toBe('simple');
    expect(automation.workers.code).toEqual({ id: 'code', prompt: 'worker-code' });
  });
});
