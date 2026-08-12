import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import type { ResearchAnswer, ResearchResolver } from '@engine/Research/ResearchTypes.js';
import { ResearchStore } from '@engine/Research/ResearchStore.js';

export class Research {
  public constructor(
    private readonly store: ResearchStore,
    private readonly resolver: ResearchResolver,
    private readonly project: Project,
    private readonly logger: EngineLogger,
  ) {}

  public async ask(question: string): Promise<ResearchAnswer> {
    const cached = await this.store.get(question);
    if (cached) {
      this.logger.info('research.hit', { question });
      return cached;
    }

    this.logger.info('research.miss', { question });
    const resolved = await this.resolver.resolve(question);
    const sources = [];
    for (const path of Array.from(new Set(resolved.sources))) {
      sources.push({ path, hash: await this.project.hash(path) });
    }
    const answer: ResearchAnswer = {
      question,
      answer: resolved.answer,
      sources,
      createdAt: new Date().toISOString(),
    };
    await this.store.put(answer);
    this.logger.info('research.resolved', { question, sources: answer.sources.map((source) => source.path) });
    return answer;
  }
}
