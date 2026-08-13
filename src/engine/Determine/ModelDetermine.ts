import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Determine, DetermineRequest } from '@engine/Determine/Determine.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { DeterminePresentation } from '@engine/Presentation/DeterminePresentation.js';

interface DetermineModelResponse {
  optionId: string;
}

export class ModelDetermine implements Determine {
  public readonly presentation = new DeterminePresentation();
  public constructor(
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly nodusLanguage = 'en',
  ) {}

  public async option<T>(request: DetermineRequest<T>): Promise<T> {
    if (request.options.length === 0) throw new Error(`Determine has no options for: ${request.goal}`);
    if (request.options.length === 1) return request.options[0].value;

    const schema: ModelResponseSchema = {
      description: 'Select exactly one best option for the supplied goal.',
      fields: {
        optionId: {
          type: 'option',
          description: 'The option that best fits the goal.',
          optionList: request.options.map((option) => ({ id: option.id, description: option.description })),
        },
      },
    };

    const response = await callModel<DetermineModelResponse>(this.model, this.logger, {
      request: {
        message: 'Determine the best available option for the current goal.',
        data: {
          goal: request.goal,
          options: request.options.map((option) => ({ id: option.id, description: option.description })),
        },
        format: ModelRequestFormat.Json,
        guidance: [
          `Reason about the supplied goal using ${this.nodusLanguage} as the internal Nodus language. Preserve identifiers exactly.`,
          'Choose exactly one option from the supplied list.',
          'Do not solve the goal yourself.',
          'Do not invent options that are not supplied.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema },
      settings: { maxTokens: 256 },
    });

    const selected = request.options.find((option) => option.id === response.optionId);
    if (!selected) throw new Error(`Determine returned unknown option: ${response.optionId}`);
    return selected.value;
  }
}
