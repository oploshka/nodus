export enum ModelRequestFormat {
  Text = 'text',
  Json = 'json',
}

export function serializeRequestData(format: ModelRequestFormat, data: unknown): string {
  if (data === undefined) return '';
  if (format === ModelRequestFormat.Json) return JSON.stringify(data, null, 2);
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}
