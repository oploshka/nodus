import { EngineRuntime } from '@engine/EngineRuntime.js';
import { QualificationTask } from '@automation/Step/Qualification/QualificationTask.js';

export const PLANNER_NESTED_STEPS_EXAMPLE = 'Изучить 3 формата хранения данных (json, yaml, xml) и сравнить их';

/** Small executable probe for the Point/Step nesting model. */
export async function runPlannerNestedStepsExample(): Promise<unknown> {
  const runtime = new EngineRuntime();
  return runtime.run(
    new QualificationTask(),
    PLANNER_NESTED_STEPS_EXAMPLE,
  );
}
