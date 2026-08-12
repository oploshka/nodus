import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NullLogger } from '../src/app/logging/Logger.js';
import { Project } from '../src/engine/project/Project.js';
import { Research } from '../src/engine/research/Research.js';
import { ResearchStore } from '../src/engine/research/ResearchStore.js';
import type { ResearchResolver } from '../src/engine/research/ResearchTypes.js';

class CountingResolver implements ResearchResolver {
  public calls = 0;
  public constructor(private readonly path: string) {}
  public async resolve() {
    this.calls += 1;
    return { answer: `answer-${this.calls}`, sources: [this.path] };
  }
}

test('Research cache becomes stale when a source hash changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nodus-research-'));
  await writeFile(join(root, 'A.ts'), 'export const a = 1;\n', 'utf8');
  const logger = new NullLogger();
  const project = new Project({ id: 'p', root, scanMode: 'manual' }, logger);
  await project.open();
  const store = new ResearchStore(project, logger);
  const resolver = new CountingResolver('A.ts');
  const research = new Research(store, resolver, project, logger);

  const first = await research.ask('how is a implemented?');
  const second = await research.ask('how is a implemented?');
  assert.equal(first.answer, 'answer-1');
  assert.equal(second.answer, 'answer-1');
  assert.equal(resolver.calls, 1);

  await writeFile(join(root, 'A.ts'), 'export const a = 2;\n', 'utf8');
  const third = await research.ask('how is a implemented?');
  assert.equal(third.answer, 'answer-2');
  assert.equal(resolver.calls, 2);
});
