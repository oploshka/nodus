import type { EngineLogger } from '../EngineLogger.js';
import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { callModel } from '../../model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '../../model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '../../model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '../../model/Response/ModelResponseSchema.js';
import type { Project } from '../project/Project.js';
import type { ResolvedResearch, ResearchResolver } from './ResearchTypes.js';

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
    private readonly maxFiles = 5,
    private readonly maxCharsPerFile = 12_000,
  ) {}

  public async resolve(question: string): Promise<ResolvedResearch> {
    const candidates = this.project.candidateFiles(question, this.maxFiles);
    if (candidates.length === 0) throw new Error(`Research found no candidate files for: ${question}`);

    const sourceBlocks: string[] = [];
    const paths: string[] = [];
    for (const candidate of candidates) {
      const content = await this.project.read(candidate.path);
      paths.push(candidate.path);
      sourceBlocks.push(`FILE ${candidate.path}\n${content.slice(0, this.maxCharsPerFile)}`);
    }

    const response = await callModel<ResearchModelResponse>(this.model, this.logger, {
      request: {
        message: question,
        data: sourceBlocks.join('\n\n'),
        format: ModelRequestFormat.Text,
        guidance: [
          'You answer one bounded question about an existing codebase.',
          'Use only the supplied files. Do not propose edits and do not broaden the task.',
          'Return concise implementation facts, concrete access paths and existing project rules when supported.',
          'If the files do not support an answer, say what is unknown.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Text, schema: researchSchema },
      settings: { maxTokens: 2048 },
    });

    return { answer: response.text, sources: paths };
  }
}
