import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationLoader } from '@app/Automation/AutomationLoader.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('AutomationLoader', () => {
  it('hydrates plain package values while preserving the root Step instance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nodus-automation-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'Prompt'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8');
    await writeFile(join(root, 'Prompt', 'RootPrompt.md'), '# Root\n\nRun the task.\n', 'utf8');
    await writeFile(join(root, 'index.js'), `
      class RootStep {
        getId() { return 'root'; }
        getGroup() { return 'qualifier'; }
        getMetadata() { return { code: 'root', title: 'Root', color: 'white' }; }
        createContext() { return {}; }
        async run(input) { return input; }
      }

      export default {
        root: new RootStep(),
        settings: {
          prompt: new URL('./Prompt/RootPrompt.md', import.meta.url)
        }
      };
    `, 'utf8');

    const automation = await AutomationLoader.load(root);
    const step = automation.root as {
      getId(): string;
      run(input: unknown): Promise<unknown>;
    };
    const settings = automation.settings as { prompt: string };

    expect(step.getId()).toBe('root');
    expect(await step.run('task')).toBe('task');
    expect(settings.prompt).toBe('# Root\n\nRun the task.\n');
  });
});
