export interface ModelResponseOption {
  id: string;
  description?: string;
}

interface ModelResponseFieldBase {
  description?: string;
  optional?: boolean;
}

export type ModelResponseFieldInfo =
  | (ModelResponseFieldBase & { type: 'string' })
  | (ModelResponseFieldBase & { type: 'number' })
  | (ModelResponseFieldBase & { type: 'boolean' })
  | (ModelResponseFieldBase & { type: 'option'; optionList: ModelResponseOption[] })
  | (ModelResponseFieldBase & { type: 'object'; fields: Record<string, ModelResponseFieldInfo> })
  | (ModelResponseFieldBase & { type: 'array'; items: ModelResponseFieldInfo })
  | (ModelResponseFieldBase & { type: 'any' });

/**
 * One response schema shape is used for every wire format.
 *
 * The root is always an object. `type: 'object'` is therefore optional and is
 * added conceptually by ModelRunner. Formats describe representation; this
 * schema describes the JavaScript object the caller expects back.
 */
export interface ModelResponseSchema {
  type?: 'object';
  description?: string;
  fields: Record<string, ModelResponseFieldInfo>;
}

export class ModelResponseFormatError extends Error {
  public constructor(
    public readonly source: string,
    message: string,
    public readonly responsePreview: string,
  ) {
    super(`[${source}] ${message}`);
    this.name = 'ModelResponseFormatError';
  }
}

export class ModelResponseSchemaError extends Error {
  public constructor(
    public readonly path: string,
    message: string,
    public readonly value: unknown,
  ) {
    super(`[schema:${path}] ${message}`);
    this.name = 'ModelResponseSchemaError';
  }
}

export function responseSchemaInstructions(schema: ModelResponseSchema): string {
  const lines = [
    schema.description ? `Expected result: ${schema.description}` : 'Expected result object:',
    ...Object.entries(schema.fields).map(([name, field]) => describeField(name, field, 0)),
  ];
  return lines.filter(Boolean).join('\n');
}

export function validateResponseSchema<TOutput extends object>(schema: ModelResponseSchema, value: unknown): TOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ModelResponseSchemaError('$', 'Expected an object', value);
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(schema.fields)) {
    const fieldValue = input[name];
    if (fieldValue === undefined || fieldValue === null) {
      if (field.optional) continue;
      throw new ModelResponseSchemaError(name, 'Required field is missing', fieldValue);
    }
    output[name] = decodeField(field, fieldValue, name);
  }
  return output as TOutput;
}

function describeField(name: string, field: ModelResponseFieldInfo, depth: number): string {
  const indent = '  '.repeat(depth);
  const optional = field.optional ? ' (optional)' : '';
  const description = field.description ? ` — ${field.description}` : '';

  if (field.type === 'option') {
    const options = field.optionList
      .map((option) => `${option.id}${option.description ? `: ${option.description}` : ''}`)
      .join('; ');
    return `${indent}- ${name}: option [${options}]${optional}${description}`;
  }
  if (field.type === 'object') {
    return [
      `${indent}- ${name}: object${optional}${description}`,
      ...Object.entries(field.fields).map(([childName, child]) => describeField(childName, child, depth + 1)),
    ].join('\n');
  }
  if (field.type === 'array') {
    return [
      `${indent}- ${name}: array${optional}${description}`,
      describeField('item', field.items, depth + 1),
    ].join('\n');
  }
  return `${indent}- ${name}: ${field.type}${optional}${description}`;
}

function decodeField(field: ModelResponseFieldInfo, value: unknown, path: string): unknown {
  if (field.type === 'array') {
    if (!Array.isArray(value)) {
      const parsed = parseStructuredValue(value, path);
      if (!Array.isArray(parsed)) throw new ModelResponseSchemaError(path, 'Expected array', value);
      value = parsed;
    }
    return value.map((item, index) => decodeField(field.items, item, `${path}[${index}]`));
  }

  value = unwrapSingleOccurrence(value, path);

  if (field.type === 'any') return value;

  if (field.type === 'string') {
    if (typeof value !== 'string') throw new ModelResponseSchemaError(path, 'Expected string', value);
    return value;
  }

  if (field.type === 'number') {
    const normalized = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(normalized)) throw new ModelResponseSchemaError(path, 'Expected number', value);
    return normalized;
  }

  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
    throw new ModelResponseSchemaError(path, 'Expected boolean', value);
  }

  if (field.type === 'option') {
    if (typeof value !== 'string') throw new ModelResponseSchemaError(path, 'Expected option id string', value);
    const match = field.optionList.find((option) => option.id === value.trim());
    if (!match) throw new ModelResponseSchemaError(path, `Unknown option '${value}'`, value);
    return match.id;
  }

  const parsed = parseStructuredValue(value, path);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ModelResponseSchemaError(path, 'Expected object', value);
  }
  const result: Record<string, unknown> = {};
  const record = parsed as Record<string, unknown>;
  for (const [name, child] of Object.entries(field.fields)) {
    const childValue = record[name];
    if (childValue === undefined || childValue === null) {
      if (child.optional) continue;
      throw new ModelResponseSchemaError(`${path}.${name}`, 'Required field is missing', childValue);
    }
    result[name] = decodeField(child, childValue, `${path}.${name}`);
  }
  return result;
}

function unwrapSingleOccurrence(value: unknown, path: string): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length !== 1) throw new ModelResponseSchemaError(path, 'Expected a single value', value);
  return value[0];
}

function parseStructuredValue(value: unknown, path: string): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { throw new ModelResponseSchemaError(path, 'Expected JSON representation of structured value', value); }
}
