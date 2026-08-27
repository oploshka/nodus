import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ConfigurationLoader', () => {
  it('resolves the automation source directory relative to the boot config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nodus-config-'));
    temporaryRoots.push(root);
    const configPath = join(root, 'nodus.config.json');
    await writeFile(configPath, JSON.stringify({
      target: { id: 'project', root: './target' },
      model: { provider: 'openai-compatible', endpoint: 'http://localhost', model: 'test' },
      automation: { root: './automation' },
    }), 'utf8');

    const configuration = await ConfigurationLoader.load(configPath);

    expect(configuration.automation?.root).toBe(resolve(root, 'automation'));
    expect(configuration.target.root).toBe(resolve(root, 'target'));
  });
});
