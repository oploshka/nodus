import { EngineRuntime } from '@engine/EngineRuntime.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { QualificationTask } from '@automation/Step/Qualification/QualificationTask.js';

/** Runs the current end-to-end automation schema: qualification -> planner? -> worker. */
export function runAutomation(
  input: unknown,
  dependencies: tEngineRunDependencies,
): Promise<unknown> {
  return new EngineRuntime().run(
    new QualificationTask(),
    input,
    dependencies,
  );
}
