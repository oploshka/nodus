// ModelAdapter.ts
import type { ModelRequest } from '@model/Request/ModelRequest';

export interface RawModelResponse {
  content: string;
  usage?: unknown;
}

export interface ModelAdapter {
  complete(request: ModelRequest): Promise<RawModelResponse>;
}
