// Planner.ts

import type { Plan } from '@core/Planning/Plan';
import type { Task } from '@core/Task/Task';

export class Planner {
  async create(task: Task): Promise<Plan> {
    return {
      steps: [
        {
          id: '1',
          description: task.description,
          status: 'pending',
        },
      ],
    };
  }
}