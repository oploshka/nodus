import type {
  sEngineComputedContext,
  sEngineSchemaStep,
} from './EngineSchemaTsType.js';

/** Runtime wrapper for an Engine execution schema. */
export class EngineSchema {
  public constructor(public readonly value: sEngineSchemaStep[]) {}

  public computeContext(
    sequence: sEngineSchemaStep[],
    index: number,
    parentInput: unknown,
  ): sEngineComputedContext {
    const step = sequence[index];
    if (!step) throw new Error(`Missing step ${index + 1}.`);

    const config = step.input?.context;
    const selectedSteps: sEngineSchemaStep[] = [];

    for (const stepNumber of config?.steps ?? []) {
      if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > index) {
        throw new Error(`Step ${index + 1} cannot read unavailable local step ${stepNumber}.`);
      }

      const target = sequence[stepNumber - 1];
      if (!target?.output) throw new Error(`Local step ${stepNumber} has no output.`);
      selectedSteps.push(target);
    }

    const previous = config?.previous && index > 0 ? sequence[index - 1] : undefined;
    if (previous && !previous.output) {
      throw new Error(`Previous local step ${index} has no output.`);
    }

    const context: sEngineComputedContext = {
      parent: config?.parent ? parentInput : undefined,
      previous,
      steps: selectedSteps,
    };

    step.runtime ??= { events: [] };
    step.runtime.context = context;
    return context;
  }
}
