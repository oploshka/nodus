// MockModelAdapter.ts
import type { ModelAdapter, RawModelResponse } from '@model/Adapter/ModelAdapter';
import type { ModelRequest } from '@model/Request/ModelRequest';

export class MockModelAdapter implements ModelAdapter {
  public async complete(_request: ModelRequest): Promise<RawModelResponse> {
    return {
      content: JSON.stringify({
        status: 'completed',
        message: 'Mock model response',
        toolCalls: [],
        changes: [],
        observations: [],
      }),
    };
  }
}
