import type { ModelResponseFormat } from '../ModelResponseFormat.js';

export interface ModelResponseFormatHandler {
  readonly format: ModelResponseFormat;
  instructions(): string;
  parse(content: string): unknown;
}
