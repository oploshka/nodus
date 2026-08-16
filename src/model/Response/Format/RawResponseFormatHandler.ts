import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';

/**
 * Generic FIELD-value raw representation.
 *
 * Simple values use `<field> <value>`. Multiline/structured values may use an
 * explicit `#field` block; everything until the next `#field` (or EOF) is one
 * raw value occurrence. The handler intentionally knows nothing about schema
 * cardinality or field semantics. Every field is represented as an array of
 * raw value occurrences and the common response schema performs normalization.
 */
export class RawResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Raw;

  public instructions(): string {
    return [
      'Return only raw fields. Do not add prose or markdown fences.',
      'For simple values use one field value per line: <fieldName> <value>.',
      'For multiline or structured values use #<fieldName> on its own line, then write the complete value until the next # field or end of response.',
      'Use the exact field names from the schema.',
      'For simple array values, repeat the field once per item.',
      'For structured arrays/objects, prefer a # field block containing valid JSON.',
    ].join('\n');
  }

  public parse(content: string): unknown {
    const result: Record<string, string[]> = {};
    const lines = content.replace(/\r\n/g, '\n').trim().split('\n');
    let blockKey: string | undefined;
    let blockLines: string[] = [];

    const flushBlock = (): void => {
      if (!blockKey) return;
      (result[blockKey] ??= []).push(blockLines.join('\n').trim());
      blockKey = undefined;
      blockLines = [];
    };

    for (const sourceLine of lines) {
      const trimmed = sourceLine.trim();
      const blockMatch = trimmed.match(/^#([^\s:#]+)\s*:?\s*$/);
      if (blockMatch) {
        flushBlock();
        blockKey = blockMatch[1];
        continue;
      }

      if (blockKey) {
        blockLines.push(sourceLine);
        continue;
      }

      if (!trimmed) continue;
      const match = trimmed.match(/^([^\s:]+)\s*(?::\s*|\s+)([\s\S]*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      (result[key] ??= []).push(value);
    }

    flushBlock();
    return result;
  }
}
