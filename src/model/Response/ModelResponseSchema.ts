export interface ModelResponseSchema<TOutput extends object> {
  readonly id: string;
  instructions(): string;
  decode(value: unknown): TOutput;
}

export class ModelResponseFormatError extends Error {
  public constructor(
    public readonly schemaId: string,
    message: string,
    public readonly responsePreview: string,
  ) {
    super(`[${schemaId}] ${message}`);
    this.name = 'ModelResponseFormatError';
  }
}
