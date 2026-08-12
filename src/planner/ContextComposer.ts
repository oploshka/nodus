import type { ComposedStepContext, PlannerContext } from '@planner/PlannerContext';
import type { PlanStep } from '@planner/TaskPlan';

export class ContextComposer {
  public compose(context: PlannerContext, step: PlanStep): ComposedStepContext {
    return context.compose(step);
  }
}
