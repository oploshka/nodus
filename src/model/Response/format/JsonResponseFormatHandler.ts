import { ModelResponseFormat } from '../ModelResponseFormat.js';
import { ModelResponseFormatError } from '../ModelResponseSchema.js';
import type { ModelResponseFormatHandler } from './ModelResponseFormatHandler.js';

export class JsonResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Json;
  public instructions(): string { return 'Return one valid JSON value only. Do not add prose.'; }
  public parse(content: string): unknown {
    const trimmed = content.trim();
    const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(unfenced); }
    catch { throw new ModelResponseFormatError('json', 'Model returned invalid JSON', content.slice(0, 500)); }
  }
}
