import type { sCoreModuleRequest, tCoreModuleResult, tCoreRunDependencies } from '@engine/Core/CoreTsType.js';
import { actionCoreResult } from './ActionCoreResult.js';

interface ResearchRuntime {
  ask(question: string, options?: unknown): Promise<unknown>;
}

export interface ResearchActionInput {
  question: string;
  settings?: unknown;
}

export class ResearchAction {
  public readonly group = 'action';
  public readonly id = 'research';

  public async execute(
    request: sCoreModuleRequest,
    dependencies: tCoreRunDependencies,
  ): Promise<tCoreModuleResult> {
    return actionCoreResult(await this.run(request.task as ResearchActionInput, dependencies));
  }

  public async run(input: ResearchActionInput, dependencies: tCoreRunDependencies) {
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
