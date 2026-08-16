import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { ProjectFiles } from '@engine/Project/File/ProjectFiles.js';
import type { ResolvedResearch, ResearchResolveOptions, ResearchResolver } from '@engine/Research/ResearchTypes.js';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';

interface ResearchModelResponse { text: string }
const researchSchema: ModelResponseSchema = {
  description: 'Concise bounded answer about the supplied project sources.',
  fields: { text: { type: 'string', description: 'Answer the research question with concrete supported implementation facts.' } },
};

export class BoundedModelResearchResolver implements ResearchResolver {
  public constructor(
    private readonly project: ProjectFiles,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly nodusLanguage = 'en',
    private readonly maxFiles = 5,
    private readonly maxCharsPerFile = 12_000,
  ) {}

  public async resolve(question: string, options?: ResearchResolveOptions): Promise<ResolvedResearch> {
    const candidates = this.project.candidateFiles(question, this.maxFiles);
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
    const readFile = options?.readFile ?? ((path: string) => this.project.read(path));
    for (const candidate of candidates) {
      const content = await readFile(candidate.path);
      paths.push(candidate.path);
      sourceBlocks.push(`FILE ${candidate.path}\n${content.slice(0, this.maxCharsPerFile)}`);
    }

    const response = await callModel<ResearchModelResponse>(this.model, this.logger, {
      request: {
        message: question,
        data: sourceBlocks.join('\n\n'),
        format: ModelRequestFormat.Text,
        guidance: [
          options?.guidance?.trim(),
          'You answer one bounded question about an existing codebase.',
          'The question may originate from a user task in any language.',
          ModelLanguagePolicy.nodus(this.nodusLanguage),
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
