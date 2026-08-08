// MockModelAdapter.ts

import type { Context } from '@core/Context/Context';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ModelResponse } from '@model/Response';

export class MockModelAdapter implements ModelAdapter {
  async send(context: Context): Promise<ModelResponse> {
    console.log('Model context:', JSON.stringify(context, null, 2));

    return {
      type: 'message',
      content: 'Mock model response',
    };
  }
}