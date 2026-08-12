import { ModelResponseFormat } from '../ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from './ModelResponseFormatHandler.js';

export class RawResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Raw;
  public instructions(): string { return 'Return only the raw schema described below. Do not add prose or markdown fences.'; }
  public parse(content: string): unknown { return content.replace(/\r\n/g, '\n').trim(); }
}
