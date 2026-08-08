import type { ComposedStepContext, ExecutionContext } from '@agent/Planning/ExecutionContext';
import type { PlanStep } from '@agent/Planning/TaskPlan';

export class ContextComposer {
  public compose(context: ExecutionContext, step: PlanStep): ComposedStepContext {
    return context.compose(step);
  }
}
