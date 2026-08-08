// Planner.ts

import type { MemoryStore } from '@core/Memory/MemoryStore';
import type { Plan } from '@core/Planning/Plan';
import type { Task } from '@core/Task/Task';

export class Planner {
  constructor(private readonly memory: MemoryStore) {}

  async create(task: Task): Promise<Plan> {
    const plan: Plan = {
      steps: [
        {
          id: '1',
          description: task.description,
          status: 'pending',
        },
      ],
    };

    this.memory.update({
      plannedSteps: plan.steps,
    });

    return plan;
  }
}