import { describe, expect, it } from 'vitest';
import { ModelResponseSchemaError, validateResponseSchema, type ModelResponseSchema } from '../../../src/model/Response/ModelResponseSchema.js';
import { RawResponseFormatHandler } from '../../../src/model/Response/format/RawResponseFormatHandler.js';

const schema: ModelResponseSchema = {
  fields: {
    status: {
      type: 'option',
      optionList: [
        { id: 'completed', description: 'Finished.' },
        { id: 'failed', description: 'Cannot finish.' },
      ],
    },
    summary: { type: 'string', optional: true },
    input: {
      type: 'object',
      optional: true,
      fields: { path: { type: 'string' } },
    },
  },
};

describe('common ModelResponseSchema', () => {
  it('validates the same object contract independently from wire format', () => {
    const raw = new RawResponseFormatHandler().parse('status completed\ninput {"path":"src/A.ts"}');
    expect(validateResponseSchema(schema, raw)).toEqual({
      status: 'completed',
      input: { path: 'src/A.ts' },
    });
  });

  it('rejects an unknown option id', () => {
    expect(() => validateResponseSchema(schema, { status: 'maybe' }))
      .toThrow(ModelResponseSchemaError);
  });
});
