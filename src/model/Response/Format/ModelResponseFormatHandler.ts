import type { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';

export interface ModelResponseFormatHandler {
  readonly format: ModelResponseFormat;
  instructions(): string;
  parse(content: string): unknown;
}
