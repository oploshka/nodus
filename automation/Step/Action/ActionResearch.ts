import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
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

export class ResearchAction extends EngineStep {
  public getId(): string {
    return 'research';
  }

  public getGroup(): string {
    return 'action';
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
      const logger = dependencies.logger as EngineLogger | undefined;
      if (!model || !logger) throw new Error('ActionResearch requires runtime model and logger.');

      const response = await callModel<ResearchResponse>(model, logger, {
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
