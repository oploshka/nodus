import type { ModelResponseFormatter } from './ModelResponseFormatter.js';

export interface TextModelResponse {
  text: string;
}

export class TextResponseFormatter implements ModelResponseFormatter<TextModelResponse> {
  public readonly id = 'text';
  public instructions(): string { return 'Return a concise plain-text answer.'; }
  public parse(content: string): TextModelResponse {
    return { text: content.trim() };
  }
}
