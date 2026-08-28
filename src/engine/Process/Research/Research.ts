import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { ResearchAnswer, ResearchResolveOptions, ResearchResolver } from '@engine/Research/ResearchTypes.js';
import { ResearchStore } from '@engine/Research/ResearchStore.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';

export class Research {
  public readonly presentation = new ResearchPresentation();
  public constructor(
    private readonly store: ResearchStore,
    private readonly resolver: ResearchResolver,
    private readonly fileSystem: FileSystem,
    private readonly logger: EngineLogger,
  ) {}

  public async ask(question: string, options?: ResearchResolveOptions): Promise<ResearchAnswer> {
    const cached = await this.store.get(question);
    if (cached) {
      this.logger.info('research.hit', { question, presentation: this.presentation });
      return cached;
    }

    this.logger.info('research.miss', { question, presentation: this.presentation });
    const resolved = await this.resolver.resolve(question, options);
    if (resolved.status === 'not-found') {
      const answer: ResearchAnswer = {
        question,
        status: 'not-found',
        answer: resolved.answer,
        sources: [],
        createdAt: new Date().toISOString(),
      };
      this.logger.info('research.not-found', { question, reason: resolved.reason, presentation: this.presentation });
      return answer;
    }

    const sources = [];
    for (const path of Array.from(new Set(resolved.sources))) {
      sources.push({ path, hash: await this.fileSystem.hash(path) });
    }
    const answer: ResearchAnswer = {
      question,
      status: 'resolved',
      answer: resolved.answer,
      sources,
      createdAt: new Date().toISOString(),
    };
    await this.store.put(answer);
    this.logger.info('research.resolved', { question, sources: answer.sources.map((source) => source.path), presentation: this.presentation });
    return answer;
  }
}
