import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';

/**
 * Generic FIELD-value raw representation.
 *
 * This handler intentionally knows nothing about Planner/Worker operations or
 * schema cardinality. Every non-empty line is parsed as `<field> <value>` (or
 * `<field>: <value>`) and every field is represented as an array of raw value
 * occurrences. The common response schema later decides whether those values
 * represent a scalar, array, object, or another supported field type.
 */
export class RawResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Raw;

  public instructions(): string {
    return [
      'Return only raw field lines. Do not add prose or markdown fences.',
      'Use one field value per line: <fieldName> <value>.',
      'Use the exact field names from the schema.',
      'For array fields, repeat the field once per item.',
      'For object values, put valid JSON for that object on the same line.',
    ].join('\n');
  }

  public parse(content: string): unknown {
    const result: Record<string, string[]> = {};
    for (const sourceLine of content.replace(/\r\n/g, '\n').trim().split('\n')) {
      const line = sourceLine.trim();
      if (!line) continue;
      const match = line.match(/^([^\s:]+)\s*(?::\s*|\s+)([\s\S]*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      (result[key] ??= []).push(value);
    }
    return result;
  }
}
