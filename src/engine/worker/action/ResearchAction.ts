import type { Research } from '../../research/Research.js';
import type { ExecutionAction, ExecutionActionContext } from './ExecutionAction.js';

interface ResearchActionInput { question: string }

export class ResearchAction implements ExecutionAction {
  public readonly id = 'research';
  public readonly description = 'Answer one bounded question about how the current project is implemented. Input: {"question":"..."}';

  public constructor(
    private readonly research: Research,
    public readonly maxUses = 3,
  ) {}

  public async execute(input: unknown, _context: ExecutionActionContext) {
    const request = this.parse(input);
    const answer = await this.research.ask(request.question);
    return {
      status: 'completed' as const,
      summary: answer.answer,
      data: {
        question: answer.question,
        answer: answer.answer,
        sources: answer.sources.map((source) => source.path),
      },
    };
  }

  private parse(input: unknown): ResearchActionInput {
    if (!input || typeof input !== 'object') throw new Error('research input must be an object');
    const question = (input as Record<string, unknown>).question;
    if (typeof question !== 'string' || question.trim().length === 0) throw new Error('research input requires question');
    return { question: question.trim() };
  }
}
