import type { Research } from '@engine/Research/Research.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ActionModelOptions, ActionResult, WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';

export interface ResearchActionInput extends ActionModelOptions {
  question: string;
  readFile?: (path: string) => Promise<string>;
}

export class ResearchAction implements WorkerAction<ResearchActionInput, ResearchAnswer> {
  public readonly id = 'research';
  public readonly presentation = new ResearchPresentation();
  public readonly name = 'Research';
  public readonly description = 'Synthesize one bounded piece of project knowledge from multiple relevant sources.';

  public constructor(
    private readonly research: Pick<Research, 'ask'>,
    guidance: ReadonlyArray<string> = [],
  ) {
    this.guidance = guidance.join('\n');
  }

  private readonly guidance: string;

  public async run(input: ResearchActionInput): Promise<ActionResult<ResearchAnswer>> {
    try {
      const answer = await this.research.ask(input.question, {
        guidance: this.guidance,
        settings: input.settings,
        readFile: input.readFile,
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
