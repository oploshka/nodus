import { ModelResponseFormatError, type ModelResponseSchema } from '../ModelResponseSchema.js';

export interface TextModelResponse {
  text: string;
}

export class TextResponseSchema implements ModelResponseSchema<TextModelResponse> {
  public readonly id = 'text';
  public instructions(): string { return 'Expected value: concise text answering the request.'; }
  public decode(value: unknown): TextModelResponse {
    if (typeof value !== 'string') throw new ModelResponseFormatError(this.id, 'Expected text response', String(value).slice(0, 500));
    return { text: value.trim() };
  }
}
