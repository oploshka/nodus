import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '../../model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '../../model/Response/ModelResponseFormat.js';
import { TextResponseSchema } from '../../model/Response/schema/TextResponseSchema.js';
import type { Project } from '../project/Project.js';
import type { ResolvedResearch, ResearchResolver } from './ResearchTypes.js';

export class BoundedModelResearchResolver implements ResearchResolver {
  private readonly schema = new TextResponseSchema();

  public constructor(
    private readonly project: Project,
    private readonly model: ModelRunner,
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

    const response = await this.model.run({
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
      response: {
        format: ModelResponseFormat.Text,
        schema: this.schema,
      },
      settings: { maxTokens: 2048 },
    });

    return { answer: response.output.text, sources: paths };
  }
}
