import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';

/**
 * Generic #FIELD raw representation.
 *
 * A field starts with `#field` and its value continues until the next field or
 * EOF. `#field value` is accepted as a compact/tolerant form. The handler knows
 * nothing about schema cardinality or field semantics: every field is emitted
 * as an array of raw value occurrences and common schema normalization builds
 * the typed response.
 */
export class RawResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Raw;

  public instructions(): string {
    return [
      'Return only raw fields. Do not add prose or markdown fences.',
      'Always start each field with #<fieldName> on its own line.',
      'Write the field value on the following line or lines, until the next # field or end of response.',
      'Use the exact field names from the schema.',
      'For array values, repeat the same # field once per item or provide a structured array value.',
      'For structured arrays/objects, use valid JSON as the field value.',
    ].join('\n');
  }

  public parse(content: string): unknown {
    const result: Record<string, string[]> = {};
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    let blockKey: string | undefined;
    let blockLines: string[] = [];

    const normalizeBlock = (source: string[]): string => {
      let start = 0;
      let end = source.length;
      if (start < end && source[start].trim() === '') start += 1;
      let removedTrailing = 0;
      while (end > start && source[end - 1].trim() === '' && removedTrailing < 2) {
        end -= 1;
        removedTrailing += 1;
      }
      return source.slice(start, end).join('\n');
    };

    const flushBlock = (): void => {
      if (!blockKey) return;
      (result[blockKey] ??= []).push(normalizeBlock(blockLines));
      blockKey = undefined;
      blockLines = [];
    };

    for (const sourceLine of lines) {
      const match = sourceLine.match(/^\s*#([^\s:#]+)(?:\s*:\s*|\s+)?(.*)$/);
      if (match) {
        flushBlock();
        blockKey = match[1];
        blockLines = match[2] ? [match[2]] : [];
        continue;
      }

      if (blockKey) blockLines.push(sourceLine);
    }

    flushBlock();
    return result;
  }
}
