import { ModelResponseFormat } from '../ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from './ModelResponseFormatHandler.js';

export class TextResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Text;
  public instructions(): string { return 'Return only the requested plain-text value. Do not wrap it in JSON or markdown fences.'; }
  public parse(content: string): unknown { return content.trim(); }
}
