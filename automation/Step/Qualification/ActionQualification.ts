import type { tEngineEmit } from '@engine/EngineEvent.js';
import { EngineStep } from '@engine/EngineStep.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';

export type tQualificationType = 'simple' | 'multi';

export interface sQualificationResult {
  type: tQualificationType;
  input: unknown;
}

interface sQualificationDecision {
  type: tQualificationType;
}

const qualificationSchema: ModelResponseSchema = {
  description: 'Classification of one task by whether it needs explicit planning before execution.',
  fields: {
    type: {
      type: 'option',
      optionList: [
        {
          id: 'simple',
          description: 'One coherent Step can execute the task directly, even if it needs several tools or edits.',
        },
        {
          id: 'multi',
          description: 'The task should be decomposed into multiple dependent or independently meaningful Steps.',
        },
      ],
    },
  },
};

/** Classifies a task before the schema routes it to Planner or Worker. */
export class ActionQualification extends EngineStep {
  public getId(): string {
    return 'ActionQualification';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<sQualificationResult> {
    const model = dependencies.model as ModelRunner | undefined;
    const emit = dependencies.emit as tEngineEmit | undefined;
    if (!model || !emit) {
      throw new Error('ActionQualification requires runtime model and emit.');
    }

    const decision = await callModel<sQualificationDecision>(model, emit, {
      request: {
        message: 'Decide whether the assigned task should be executed directly or explicitly planned into multiple Steps.',
        data: { input },
        format: ModelRequestFormat.Json,
        guidance: [
          'Choose simple when one Worker can own the requested outcome end-to-end.',
          'A task is still simple when it requires several file reads, searches, research calls, or edits.',
          'Choose multi only when decomposition creates multiple meaningful tasks with distinct outcomes or dependencies.',
          'Avoid planning merely because the task mentions several files or implementation details.',
          'Return only the classification.',
        ].join('\n'),
      },
      response: {
        format: ModelResponseFormat.Raw,
        schema: qualificationSchema,
      },
      settings: { maxTokens: 128 },
    });

    return {
      type: decision.type,
      input,
    };
  }
}
