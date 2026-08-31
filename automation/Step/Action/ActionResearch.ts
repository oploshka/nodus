import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput } from '@engine/Core/EngineSchemaTsType.js';
import type { sEngineStepRequest, tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { actionCoreResult } from './ActionCoreResult.js';

interface ResearchRuntime {
  ask(question: string, options?: unknown): Promise<unknown>;
}

export interface ResearchActionInput {
  question: string;
  settings?: unknown;
}

export class ResearchAction extends EngineStep {
  public getId(): string {
    return 'research';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    request: sEngineStepRequest,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return actionCoreResult(await this.perform(request.task as ResearchActionInput, dependencies));
  }

  private async perform(input: ResearchActionInput, dependencies: tEngineRunDependencies) {
    try {
      const research = dependencies.research as ResearchRuntime | undefined;
      if (!research) throw new Error('ActionResearch requires runtime research dependency.');
      const answer = await research.ask(input.question, { settings: input.settings });
      return { status: 'completed' as const, data: { kind: 'research' as const, value: answer } };
    } catch (error) {
      return {
        status: 'not-completed' as const,
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true as const,
      };
    }
  }
}
