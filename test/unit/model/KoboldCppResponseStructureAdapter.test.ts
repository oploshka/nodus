import { describe, expect, it } from 'vitest';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { KoboldCppResponseStructureAdapter } from '@model/Response/Structure/KoboldCppResponseStructureAdapter.js';

const schema: ModelResponseSchema = {
  fields: {
    outcome: {
      type: 'option',
      optionList: [
        { id: 'ready' },
        { id: 'missing-information' },
      ],
    },
    reason: { type: 'string', optional: true },
    changes: {
      type: 'array',
      optional: true,
      items: {
        type: 'object',
        fields: {
          type: {
            type: 'option',
            optionList: [{ id: 'update' }, { id: 'create' }],
          },
          path: { type: 'string' },
          instruction: { type: 'string' },
        },
      },
    },
  },
};

describe('KoboldCppResponseStructureAdapter', () => {
  it('compiles raw response schemas to GBNF with exact field markers and structured values', () => {
    const constraint = new KoboldCppResponseStructureAdapter().compile(ModelResponseFormat.Raw, schema);

    expect(constraint?.type).toBe('gbnf');
    expect(constraint?.grammar).toContain('root ::=');
    expect(constraint?.grammar).toContain('#outcome\\n');
    expect(constraint?.grammar).toContain('ready');
    expect(constraint?.grammar).toContain('#changes\\n');
    expect(constraint?.grammar).toContain('update');
    expect(constraint?.grammar).toContain('json-string');
  });

  it('compiles JSON response schemas but leaves text and diff responses unconstrained', () => {
    const adapter = new KoboldCppResponseStructureAdapter();

    expect(adapter.compile(ModelResponseFormat.Json, schema)?.grammar).toContain('json-object-schema');
    expect(adapter.compile(ModelResponseFormat.Text, schema)).toBeUndefined();
    expect(adapter.compile(ModelResponseFormat.Diff, schema)).toBeUndefined();
  });
});
