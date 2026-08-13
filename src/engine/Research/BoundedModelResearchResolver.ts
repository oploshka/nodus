import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { Project } from '@engine/Project/Project.js';
import type { ResearchRequest, ResolvedResearch, ResearchResolveOptions, ResearchResolver } from '@engine/Research/ResearchTypes.js';

interface ResearchModelResponse { text: string }
const researchSchema: ModelResponseSchema = {
  description: 'Concise bounded answer about the supplied project sources.',
  fields: { text: { type: 'string', description: 'Answer the research question with concrete supported implementation facts.' } },
};

export class BoundedModelResearchResolver implements ResearchResolver {
  public constructor(
    private readonly project: Project,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly nodusLanguage = 'en',
    private readonly maxFiles = 5,
    private readonly maxCharsPerFile = 12_000,
  ) {}

  public async resolve(request: ResearchRequest, options?: ResearchResolveOptions): Promise<ResolvedResearch> {
    const targetedPaths = request.targets?.filter((target) => target.type === 'file').map((target) => target.path) ?? [];
    const candidatePaths = targetedPaths.length > 0
      ? targetedPaths.slice(0, this.maxFiles)
      : this.project.candidateFiles(request.question, this.maxFiles).map((candidate) => candidate.path);
    const candidates = candidatePaths;
    if (candidates.length === 0) {
      return {
        status: 'not-found',
        answer: 'No candidate project files were found for this question.',
        sources: [],
        reason: 'No candidate files matched the research question.',
      };
    }

    const sourceBlocks: string[] = [];
    const paths: string[] = [];
    for (const path of candidates) {
      const resolvedPath = await this.project.resolvePath(path);
      const content = await this.project.read(resolvedPath);
      paths.push(resolvedPath);
      sourceBlocks.push(`FILE ${resolvedPath}\n${content.slice(0, this.maxCharsPerFile)}`);
    }

    const response = await callModel<ResearchModelResponse>(this.model, this.logger, {
      request: {
        message: request.question,
        data: sourceBlocks.join('\n\n'),
        format: ModelRequestFormat.Text,
        guidance: [
          options?.guidance?.trim(),
          'You answer one bounded question about an existing codebase.',
          `The question may originate from a user task in any language. Return the internal research answer in ${this.nodusLanguage}. Preserve code identifiers, paths and symbols exactly.`,
          'Use only the supplied files. Do not propose edits and do not broaden the task.',
          'Return concise implementation facts, concrete access paths and existing project rules when supported.',
          'If the files do not support an answer, say what is unknown.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Text, schema: researchSchema },
      settings: { maxTokens: 2048, ...options?.settings },
    });

    return { status: 'resolved', answer: response.text, sources: paths };
  }
}
