import { EngineRuntime } from '@engine/EngineRuntime.js';
import { TaskQualification } from '@automation/Step/Qualification/TaskQualification.js';

export const PLANNER_NESTED_STEPS_EXAMPLE = 'Изучить 3 формата хранения данных (json, yaml, xml) и сравнить их';

/** Small executable probe for the Point/Step nesting model. */
export async function runPlannerNestedStepsExample(): Promise<unknown> {
  const runtime = new EngineRuntime();
  return runtime.run(
    new TaskQualification(),
    PLANNER_NESTED_STEPS_EXAMPLE,
  );
}
