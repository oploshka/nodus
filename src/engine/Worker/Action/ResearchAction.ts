import type { Research } from '@engine/Research/Research.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ActionModelOptions, ActionResult, WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';

export interface ResearchActionInput extends ActionModelOptions {
  question: string;
}

export class ResearchAction implements WorkerAction<ResearchActionInput, ResearchAnswer> {
  public readonly id = 'research';
  public readonly presentation = new ResearchPresentation();
  public readonly name = 'Research';
  public readonly description = 'Resolve one concrete project knowledge gap using cached project evidence when possible.';

  public constructor(
    private readonly research: Pick<Research, 'ask'>,
    private readonly guidance = [
      'Answer exactly one bounded implementation question about the current project.',
      'Do not broaden the task, propose unrelated changes, or invent project facts.',
      'Prefer concrete file paths, identifiers, existing APIs and current project conventions.',
    ].join('\n'),
  ) {}

  public async run(input: ResearchActionInput): Promise<ActionResult<ResearchAnswer>> {
    try {
      const answer = await this.research.ask(input.question, {
        guidance: this.guidance,
        settings: input.settings,
      });
      return { status: 'completed', data: answer };
    } catch (error) {
      return {
        status: 'not-completed',
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true,
      };
    }
  }
}
