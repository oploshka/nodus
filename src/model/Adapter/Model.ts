import type { ModelAdapter } from '@model/Adapter/ModelAdapter';

export interface Model {
  name: string;
  adapter: ModelAdapter;
}