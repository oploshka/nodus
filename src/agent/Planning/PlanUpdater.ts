import type { PlanStep, TaskPlan } from '@agent/Planning/TaskPlan';

export class PlanUpdater {
  public insertBefore(plan: TaskPlan, index: number, steps: PlanStep[]): void {
    plan.steps.splice(index, 0, ...steps);
  }

  public markPendingFrom(plan: TaskPlan, index: number): void {
    for (let i = index; i < plan.steps.length; i += 1) {
      if (plan.steps[i].status !== 'completed') plan.steps[i].status = 'pending';
    }
  }
}
