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
    const raw = new RawResponseFormatHandler().parse('#status\ncompleted\n#input\n{"path":"src/A.ts"}');
    expect(validateResponseSchema(schema, raw)).toEqual({
      status: 'completed',
      input: { path: 'src/A.ts' },
    });
  });

  it('normalizes repeated raw values according to array item schema', () => {
    const raw = new RawResponseFormatHandler().parse([
      '#status', 'completed',
      '#files', 'src/A.ts',
      '#files', 'src/B.ts',
      '#edits', '{"path":"src/A.ts","instruction":"Change A"}',
      '#edits', '{"path":"src/B.ts","instruction":"Change B"}',
    ].join('\n'));
    const result = validateResponseSchema({
      fields: {
        status: schema.fields.status,
        files: { type: 'array', items: { type: 'string' } },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              path: { type: 'string' },
              instruction: { type: 'string' },
            },
          },
        },
      },
    }, raw);

    expect(result).toEqual({
      status: 'completed',
      files: ['src/A.ts', 'src/B.ts'],
      edits: [
        { path: 'src/A.ts', instruction: 'Change A' },
        { path: 'src/B.ts', instruction: 'Change B' },
      ],
    });
  });

  it('keeps a single raw array occurrence as a one-item array', () => {
    const raw = new RawResponseFormatHandler().parse('#files\nsrc/A.ts');
    expect(validateResponseSchema({
      fields: { files: { type: 'array', items: { type: 'string' } } },
    }, raw)).toEqual({ files: ['src/A.ts'] });
  });

  it('accepts compact #field value form', () => {
    const raw = new RawResponseFormatHandler().parse('#status completed\n#summary Change prepared');
    expect(validateResponseSchema(schema, raw)).toEqual({ status: 'completed', summary: 'Change prepared' });
  });

  it('normalizes a multiline raw block as one structured array value', () => {
    const raw = new RawResponseFormatHandler().parse([
      '#status', 'completed',
      '#files', '[', '  "src/A.ts",', '  "src/B.ts"', ']',
    ].join('\n'));

    expect(validateResponseSchema({
      fields: {
        status: schema.fields.status,
        files: { type: 'array', items: { type: 'string' } },
      },
    }, raw)).toEqual({ status: 'completed', files: ['src/A.ts', 'src/B.ts'] });
  });

  it('normalizes a multiline raw block containing an array of objects', () => {
    const raw = new RawResponseFormatHandler().parse([
      '#status', 'completed',
      '#edits', '[',
      '  {"path":"src/A.ts","instruction":"Change A"},',
      '  {"path":"src/B.ts","instruction":"Change B"}',
      ']',
    ].join('\n'));

    expect(validateResponseSchema({
      fields: {
        status: schema.fields.status,
        edits: {
          type: 'array',
          items: { type: 'object', fields: { path: { type: 'string' }, instruction: { type: 'string' } } },
        },
      },
    }, raw)).toEqual({
      status: 'completed',
      edits: [
        { path: 'src/A.ts', instruction: 'Change A' },
        { path: 'src/B.ts', instruction: 'Change B' },
      ],
    });
  });

  it('preserves internal block whitespace while removing only boundary blank lines', () => {
    const raw = new RawResponseFormatHandler().parse('#summary\n\n  first\n  second\n\n');
    expect(raw).toEqual({ summary: ['  first\n  second'] });
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
    expect(() => validateResponseSchema(schema, { status: 'maybe' })).toThrow(ModelResponseSchemaError);
  });
});
