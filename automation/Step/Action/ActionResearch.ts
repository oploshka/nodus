import type { tEngineEmit } from '@engine/EngineEvent.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import type { ModelRunSettings } from '@model/Request/ModelRun.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { actionCoreResult, type tActionCoreResult } from './ActionCoreResult.js';

export interface ResearchActionInput {
  question: string;
  settings?: ModelRunSettings;
}

export interface ResearchActionData {
  kind: 'research';
  value: unknown;
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
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<ResearchActionData>> {
    return actionCoreResult(await this.perform(readInput(input), dependencies));
  }

  private async perform(
    input: ResearchActionInput,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<ResearchActionData>> {
    if (!input.question.trim()) {
      return { status: 'failed', reason: 'Research question is empty.', canContinue: false };
    }

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
        status: 'completed',
        data: { kind: 'research', value: response.answer },
      };
    } catch (error) {
      return {
        status: 'not-completed',
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true,
      };
    }
  }
}

function readInput(input: unknown): ResearchActionInput {
  if (!isRecord(input)) return { question: '' };

  return {
    question: typeof input.question === 'string' ? input.question : '',
    settings: isRecord(input.settings) ? input.settings as ModelRunSettings : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
