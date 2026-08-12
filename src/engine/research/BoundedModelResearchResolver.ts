import type { ModelRunner } from '../../model/Runner/ModelRunner.js';
import { TextResponseFormatter } from '../../model/Response/TextResponseFormatter.js';
import type { Project } from '../project/Project.js';
import type { ResolvedResearch, ResearchResolver } from './ResearchTypes.js';

export class BoundedModelResearchResolver implements ResearchResolver {
  private readonly formatter = new TextResponseFormatter();

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
      maxTokens: 2048,
      formatter: this.formatter,
      messages: [
        {
          role: 'system',
          content: [
            'You answer one bounded question about an existing codebase.',
            'Use only the supplied files. Do not propose edits and do not broaden the task.',
            'Return concise implementation facts, concrete access paths and existing project rules when supported.',
            'If the files do not support an answer, say what is unknown.',
          ].join('\n'),
        },
        { role: 'user', content: `QUESTION\n${question}\n\n${sourceBlocks.join('\n\n')}` },
      ],
    });

    return { answer: response.output.text, sources: paths };
  }
}
