import type { PlanStep, TaskPlan } from '@planner/TaskPlan';

export class PlanUpdater {
  public insertBefore(plan: TaskPlan, index: number, steps: PlanStep[]): void {
    plan.steps.splice(index, 0, ...steps);
    plan.version += 1;
  }

  public markPendingFrom(plan: TaskPlan, index: number): void {
    for (let i = index; i < plan.steps.length; i += 1) {
      if (plan.steps[i].status !== 'completed') plan.steps[i].status = 'pending';
    }
  }
}
