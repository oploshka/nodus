import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { PathResolver } from '@engine/Common/Tools/PathResolver.js';
import { Research } from '@engine/Research/Research.js';
import { ResearchStore } from '@engine/Research/ResearchStore.js';
import type { ResearchResolveOptions, ResearchResolver, ResolvedResearch } from '@engine/Research/ResearchTypes.js';
import { TestProject } from '@test-framework/TestProject.js';

class CountingResolver implements ResearchResolver {
  public calls = 0;
  public constructor(private readonly path: string) {}
  public async resolve(_question: string, _options?: ResearchResolveOptions): Promise<ResolvedResearch> {
    this.calls += 1;
    return { status: 'resolved', answer: `answer-${this.calls}`, sources: [this.path] };
  }
}

function files(root: string, logger: NullLogger): FileSystem {
  return new FileSystem(root, new PathResolver(root), () => undefined, logger, []);
}

describe('ResearchStore', () => {
  it('invalidates a cached answer when a source hash changes', async () => {
    const fixture = await TestProject.create('research-cache', { 'A.ts': 'export const a = 1;\n' });
    try {
      const logger = new NullLogger();
      const fileSystem = files(fixture.root, logger);
      const store = new ResearchStore(fileSystem, logger);
      const resolver = new CountingResolver('A.ts');
      const research = new Research(store, resolver, fileSystem, logger);

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

  it('returns not-found without caching the miss', async () => {
    const fixture = await TestProject.create('research-not-found', { 'A.ts': 'export const a = 1;\n' });
    try {
      const logger = new NullLogger();
      const fileSystem = files(fixture.root, logger);
      const store = new ResearchStore(fileSystem, logger);
      let calls = 0;
      const resolver: ResearchResolver = {
        async resolve() {
          calls += 1;
          return {
            status: 'not-found',
            answer: 'No candidate project files were found for this question.',
            sources: [],
            reason: 'No candidate files matched the research question.',
          };
        },
      };
      const research = new Research(store, resolver, fileSystem, logger);

      const first = await research.ask('unknown thing?');
      const second = await research.ask('unknown thing?');

      expect(first.status).toBe('not-found');
      expect(second.status).toBe('not-found');
      expect(calls).toBe(2);
    } finally {
      await fixture.dispose();
    }
  });
});
