import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';

/**
 * Generic FIELD-value raw representation.
 *
 * This handler intentionally knows nothing about Planner/Worker operations.
 * Every non-empty line is parsed as `<field> <value>` (or `<field>: <value>`).
 * Repeated fields become arrays. Structured field values may be one-line JSON
 * and are interpreted later by the common response schema validator.
 */
export class RawResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Raw;

  public instructions(): string {
    return [
      'Return only raw field lines. Do not add prose or markdown fences.',
      'Use one field per line: <fieldName> <value>.',
      'Use the exact field names from the schema.',
      'For object or array values, put valid JSON on the same line.',
    ].join('\n');
  }

  public parse(content: string): unknown {
    const result: Record<string, unknown> = {};
    for (const sourceLine of content.replace(/\r\n/g, '\n').trim().split('\n')) {
      const line = sourceLine.trim();
      if (!line) continue;
      const match = line.match(/^([^\s:]+)\s*(?::\s*|\s+)([\s\S]*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      const existing = result[key];
      if (existing === undefined) result[key] = value;
      else if (Array.isArray(existing)) existing.push(value);
      else result[key] = [existing, value];
    }
    return result;
  }
}
