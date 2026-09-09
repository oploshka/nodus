import type { ModelGenerationConstraint } from '@model/Type/ModelGenerationConstraint.js';
import type { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

export interface ModelResponseStructureAdapter {
  compile(
    format: ModelResponseFormat,
    schema: ModelResponseSchema,
  ): ModelGenerationConstraint | undefined;
}
