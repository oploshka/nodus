// ModelAdapter.ts

import type { Context } from '@core/Context/Context';
import type { ModelResponse } from '@model/Response';

export interface ModelAdapter {
  send(context: Context): Promise<ModelResponse>;
}