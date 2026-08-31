import type { sEngineOutput, sEngineSchemaStep, tEngineEmit } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import type { ModelRunSettings } from '@model/Request/ModelRun.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { actionCoreResult } from './ActionCoreResult.js';

export interface ResearchActionInput {
  question: string;
  settings?: ModelRunSettings;
}

interface ResearchResponse {
  answer: unknown;
}

const researchResponseSchema: ModelResponseSchema = {
  description: 'Answer to the requested project research question.',
  fields: {
    answer: { type: 'any' },
  },
};

export class ResearchAction extends StepAction {
  public getId(): string {
    return 'research';
  }

  public async run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    return actionCoreResult(await this.perform(step.task as ResearchActionInput, dependencies));
  }

  private async perform(input: ResearchActionInput, dependencies: tEngineRunDependencies) {
    try {
      const model = dependencies.model as ModelRunner | undefined;
      const emit = dependencies.emit as tEngineEmit | undefined;
      if (!model || !emit) throw new Error('ActionResearch requires runtime model and emit.');

      const response = await callModel<ResearchResponse>(model, emit, {
        request: {
          message: input.question,
          format: ModelRequestFormat.Text,
        },
        response: {
          format: ModelResponseFormat.Raw,
          schema: researchResponseSchema,
        },
        settings: input.settings,
      });

      return {
        status: 'completed' as const,
        data: { kind: 'research' as const, value: response.answer },
      };
    } catch (error) {
      return {
        status: 'not-completed' as const,
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true as const,
      };
    }
  }
}
