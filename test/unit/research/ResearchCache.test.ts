import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import { Project } from '@engine/Project/Project.js';
import { Research } from '@engine/Research/Research.js';
import { ResearchStore } from '@engine/Research/ResearchStore.js';
import type { ResearchResolver } from '@engine/Research/ResearchTypes.js';
import { TestProject } from '@test/framework/TestProject.js';

class CountingResolver implements ResearchResolver {
  public calls = 0;
  public constructor(private readonly path: string) {}
  public async resolve() {
    this.calls += 1;
    return { answer: `answer-${this.calls}`, sources: [this.path] };
  }
}

describe('ResearchStore', () => {
  it('invalidates a cached answer when a source hash changes', async () => {
    const fixture = await TestProject.create('research-cache', { 'A.ts': 'export const a = 1;\n' });
    try {
      const logger = new NullLogger();
      const project = new Project({ id: 'p', root: fixture.root, scanMode: 'manual' }, logger);
      await project.open();
      const store = new ResearchStore(project, logger);
      const resolver = new CountingResolver('A.ts');
      const research = new Research(store, resolver, project, logger);

      const first = await research.ask('how is a implemented?');
      const second = await research.ask('how is a implemented?');
      expect(first.answer).toBe('answer-1');
      expect(second.answer).toBe('answer-1');
      expect(resolver.calls).toBe(1);

      await fixture.write('A.ts', 'export const a = 2;\n');
      const third = await research.ask('how is a implemented?');
      expect(third.answer).toBe('answer-2');
      expect(resolver.calls).toBe(2);
    } finally {
      await fixture.dispose();
    }
  });
});
