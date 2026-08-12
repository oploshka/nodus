export interface ModelResponseFormatter<TOutput extends object> {
  readonly id: string;
  instructions(): string;
  parse(content: string): TOutput;
}

export class ModelResponseFormatError extends Error {
  public constructor(
    public readonly formatterId: string,
    message: string,
    public readonly responsePreview: string,
  ) {
    super(`[${formatterId}] ${message}`);
    this.name = 'ModelResponseFormatError';
  }
}
