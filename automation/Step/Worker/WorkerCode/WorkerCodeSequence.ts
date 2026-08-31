import type { sEngineSequence, tEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';

export type tWorkerCodeStepMatch = (step: tEngineSchemaStep) => boolean;

export function previousSteps(
  sequence: sEngineSequence,
  stepNumber: number,
  match: tWorkerCodeStepMatch,
): tEngineSchemaStep[] {
  const end = Math.max(0, Math.min(sequence.steps.length, stepNumber - 1));
  return sequence.steps.slice(0, end).filter(match);
}

export function previousStepNumbers(
  sequence: sEngineSequence,
  stepNumber: number,
  match: tWorkerCodeStepMatch,
): number[] {
  const end = Math.max(0, Math.min(sequence.steps.length, stepNumber - 1));
  const result: number[] = [];

  for (let index = 0; index < end; index += 1) {
    const step = sequence.steps[index];
    if (step && match(step)) result.push(index + 1);
  }

  return result;
}
