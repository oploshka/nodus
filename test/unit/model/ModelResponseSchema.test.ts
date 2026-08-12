import { describe, expect, it } from 'vitest';
import { ModelResponseSchemaError, responseSchemaInstructions, validateResponseSchema, type ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { RawResponseFormatHandler } from '@model/Response/Format/RawResponseFormatHandler.js';

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


  it('describes nested fields inside arrays of objects to the model', () => {
    const instructions = responseSchemaInstructions({
      fields: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              goal: { type: 'string' },
              constraints: { type: 'array', items: { type: 'string' }, optional: true },
            },
          },
        },
      },
    });

    expect(instructions).toContain('- steps: array');
    expect(instructions).toContain('- item: object');
    expect(instructions).toContain('- goal: string');
    expect(instructions).toContain('- constraints: array (optional)');
  });

  it('rejects an unknown option id', () => {
    expect(() => validateResponseSchema(schema, { status: 'maybe' }))
      .toThrow(ModelResponseSchemaError);
  });
});
