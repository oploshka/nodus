import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseFormatHandler } from '@model/Response/Format/ModelResponseFormatHandler.js';

export class TextResponseFormatHandler implements ModelResponseFormatHandler {
  public readonly format = ModelResponseFormat.Text;
  public instructions(): string { return 'Return only the requested plain-text value. Do not wrap it in JSON or markdown fences.'; }
  public parse(content: string): unknown { return { text: content.trim() }; }
}
