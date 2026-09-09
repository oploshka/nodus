import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type {
  ModelResponseFieldInfo,
  ModelResponseSchema,
} from '@model/Response/ModelResponseSchema.js';
import type { ModelGenerationConstraint } from '@model/Type/ModelGenerationConstraint.js';
import type { ModelResponseStructureAdapter } from './ModelResponseStructureAdapter.js';

type SchemaEntry = [name: string, field: ModelResponseFieldInfo];

/** KoboldCpp constrained-generation adapter using GBNF grammar sampling. */
export class KoboldCppResponseStructureAdapter implements ModelResponseStructureAdapter {
  public compile(
    format: ModelResponseFormat,
    schema: ModelResponseSchema,
  ): ModelGenerationConstraint | undefined {
    if (format !== ModelResponseFormat.Raw && format !== ModelResponseFormat.Json) return undefined;
    return {
      type: 'gbnf',
      grammar: new GbnfSchemaCompiler().compile(format, schema),
    };
  }
}

class GbnfSchemaCompiler {
  private readonly rules: string[] = [];
  private sequence = 0;

  public compile(format: ModelResponseFormat, schema: ModelResponseSchema): string {
    this.addBaseRules();
    const entries = Object.entries(schema.fields);
    const root = format === ModelResponseFormat.Raw
      ? this.rawObject(entries)
      : this.jsonObject(entries);
    return [`root ::= ${root}`, ...this.rules].join('\n');
  }

  private rawObject(entries: SchemaEntry[]): string {
    const fieldRules = new Map(entries.map(([name, field]) => [name, this.rawField(name, field)]));
    const variants = this.fieldVariants(entries).filter((variant) => variant.length > 0);
    if (variants.length === 0) throw new Error('GBNF response schema requires at least one emitted field.');

    return this.alternatives(variants.map((variant) => variant
      .map(([name], index) => `${index === 0 ? '' : `${literal('\n')} `}${fieldRules.get(name)}`.trim())
      .join(' ')));
  }

  private rawField(name: string, field: ModelResponseFieldInfo): string {
    const value = this.rawValue(field);
    return this.rule(`raw-field-${name}`, `${literal(`#${name}\n`)} ${value}`);
  }

  private rawValue(field: ModelResponseFieldInfo): string {
    if (field.type === 'string') return 'raw-text';
    if (field.type === 'number') return 'number';
    if (field.type === 'boolean') return this.alternatives([literal('true'), literal('false')]);
    if (field.type === 'option') {
      return this.alternatives(field.optionList.map((option) => literal(option.id)));
    }
    if (field.type === 'filePathList') return 'file-path-list';
    if (field.type === 'editList') return this.editList();
    if (field.type === 'array') return this.jsonArray(field.items);
    if (field.type === 'object') return this.jsonObject(Object.entries(field.fields));
    return 'raw-text';
  }

  private jsonValue(field: ModelResponseFieldInfo): string {
    if (field.type === 'string') return 'json-string';
    if (field.type === 'number') return 'number';
    if (field.type === 'boolean') return this.alternatives([literal('true'), literal('false')]);
    if (field.type === 'option') {
      return this.alternatives(field.optionList.map((option) => literal(JSON.stringify(option.id))));
    }
    if (field.type === 'filePathList') return this.jsonArray({ type: 'string' });
    if (field.type === 'editList') return this.editList();
    if (field.type === 'array') return this.jsonArray(field.items);
    if (field.type === 'object') return this.jsonObject(Object.entries(field.fields));
    return 'json-value';
  }

  private jsonObject(entries: SchemaEntry[]): string {
    const variants = this.fieldVariants(entries);
    const alternatives = variants.map((variant) => {
      const members = variant.map(([name, field]) => [
        literal(JSON.stringify(name)),
        'ws',
        literal(':'),
        'ws',
        this.jsonValue(field),
      ].join(' '));
      const body = members.join(` ws ${literal(',')} ws `);
      return [literal('{'), 'ws', body, 'ws', literal('}')].filter(Boolean).join(' ');
    });
    return this.rule('json-object-schema', this.alternatives(alternatives));
  }

  private jsonArray(item: ModelResponseFieldInfo): string {
    const value = this.jsonValue(item);
    return this.rule(
      'json-array-schema',
      `${literal('[')} ws (${value} (ws ${literal(',')} ws ${value})*)? ws ${literal(']')}`,
    );
  }

  private editList(): string {
    const item = this.jsonObject([
      ['path', { type: 'string' }],
      ['instruction', { type: 'string' }],
    ]);
    return this.rule(
      'edit-list',
      `${literal('[')} ws (${item} (ws ${literal(',')} ws ${item})*)? ws ${literal(']')}`,
    );
  }

  private fieldVariants(entries: SchemaEntry[]): SchemaEntry[][] {
    let variants: SchemaEntry[][] = [[]];
    for (const entry of entries) {
      if (entry[1].optional) {
        variants = variants.flatMap((variant) => [variant, [...variant, entry]]);
      } else {
        variants = variants.map((variant) => [...variant, entry]);
      }
    }
    return variants;
  }

  private alternatives(values: string[]): string {
    if (values.length === 0) throw new Error('GBNF rule requires at least one alternative.');
    if (values.length === 1) return values[0];
    return `(${values.join(' | ')})`;
  }

  private rule(prefix: string, expression: string): string {
    const name = `${sanitize(prefix)}-${this.sequence++}`;
    this.rules.push(`${name} ::= ${expression}`);
    return name;
  }

  private addBaseRules(): void {
    this.rules.push('ws ::= [ \\t\\n\\r]*');
    this.rules.push('raw-text ::= [^#\\n] [^\\n]*');
    this.rules.push('file-path ::= [^#\\n] [^\\n]*');
    this.rules.push(`file-path-list ::= file-path (${literal('\n')} file-path)*`);
    this.rules.push('hex ::= [0-9a-fA-F]');
    this.rules.push('json-string ::= "\\\"" json-char* "\\\""');
    this.rules.push('json-char ::= [^"\\\\] | "\\\\" (["\\\\/bfnrt] | "u" hex hex hex hex)');
    this.rules.push('integer ::= "-"? ("0" | [1-9] [0-9]*)');
    this.rules.push('number ::= integer ("." [0-9]+)? ([eE] [+-]? [0-9]+)?');
    this.rules.push('json-array ::= "[" ws (json-value (ws "," ws json-value)*)? ws "]"');
    this.rules.push('json-object ::= "{" ws (json-string ws ":" ws json-value (ws "," ws json-string ws ":" ws json-value)*)? ws "}"');
    this.rules.push('json-value ::= json-string | number | "true" | "false" | "null" | json-array | json-object');
  }
}

function literal(value: string): string {
  return JSON.stringify(value);
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9-]/g, '-').replace(/^-+/, '') || 'rule';
}
