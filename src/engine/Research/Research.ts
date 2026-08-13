import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import type { ResearchAnswer, ResearchRequest, ResearchResolveOptions, ResearchResolver } from '@engine/Research/ResearchTypes.js';
import { ResearchStore } from '@engine/Research/ResearchStore.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';

export class Research {
  public readonly presentation = new ResearchPresentation();
  public constructor(
    private readonly store: ResearchStore,
    private readonly resolver: ResearchResolver,
    private readonly project: Project,
    private readonly logger: EngineLogger,
  ) {}

  public async ask(request: ResearchRequest, options?: ResearchResolveOptions): Promise<ResearchAnswer> {
    const cached = await this.store.get(request);
    if (cached) {
      this.logger.info('research.hit', { request, presentation: this.presentation });
      return cached;
    }

    this.logger.info('research.miss', { request, presentation: this.presentation });
    const resolved = await this.resolver.resolve(request, options);
    if (resolved.status === 'not-found') {
      const answer: ResearchAnswer = {
        question: request.question,
        targets: request.targets,
        status: 'not-found',
        answer: resolved.answer,
        sources: [],
        createdAt: new Date().toISOString(),
      };
      this.logger.info('research.not-found', { request, reason: resolved.reason, presentation: this.presentation });
      return answer;
    }

    const sources = [];
    for (const path of Array.from(new Set(resolved.sources))) {
      sources.push({ path, hash: await this.project.hash(path) });
    }
    const answer: ResearchAnswer = {
      question: request.question,
      targets: request.targets,
      status: 'resolved',
      answer: resolved.answer,
      sources,
      createdAt: new Date().toISOString(),
    };
    await this.store.put(answer);
    this.logger.info('research.resolved', { request, sources: answer.sources.map((source) => source.path), presentation: this.presentation });
    return answer;
  }
}
