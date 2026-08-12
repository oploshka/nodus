import type { Logger } from '../../app/logging/Logger.js';
import type { Project } from '../project/Project.js';
import type { ResearchAnswer, ResearchResolver } from './ResearchTypes.js';
import { ResearchStore } from './ResearchStore.js';

export class Research {
  public constructor(
    private readonly store: ResearchStore,
    private readonly resolver: ResearchResolver,
    private readonly project: Project,
    private readonly logger: Logger,
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
    return answer;
  }
}
