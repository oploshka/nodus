import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import { ModelResponseFormatError } from '@model/Response/ModelResponseSchema.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';

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
