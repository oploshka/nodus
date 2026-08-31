import type { sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';

export type tWorkerCodeStepMatch = (step: sEngineSchemaStep) => boolean;

export function previousSteps(
  sequence: sEngineSchemaStep,
  stepNumber: number,
  match: tWorkerCodeStepMatch,
): sEngineSchemaStep[] {
  const steps = sequenceSteps(sequence);
  const end = Math.max(0, Math.min(steps.length, stepNumber - 1));
  return steps.slice(0, end).filter(match);
}

export function previousStepNumbers(
  sequence: sEngineSchemaStep,
  stepNumber: number,
  match: tWorkerCodeStepMatch,
): number[] {
  const steps = sequenceSteps(sequence);
  const end = Math.max(0, Math.min(steps.length, stepNumber - 1));
  const result: number[] = [];

  for (let index = 0; index < end; index += 1) {
    const step = steps[index];
    if (step && match(step)) result.push(index + 1);
  }

  return result;
}

function sequenceSteps(sequence: sEngineSchemaStep): sEngineSchemaStep[] {
  if (sequence.steps === null) throw new Error('WorkerCode expected a schema step chain.');
  return sequence.steps;
}
