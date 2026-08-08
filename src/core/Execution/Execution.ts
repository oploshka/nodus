// Execution.ts

import type { Context } from '@core/Context/Context';
import type { Task } from '@core/Task/Task';

export interface Execution {
  task: Task;
  context: Context;
  step: number;
  completed: boolean;
}