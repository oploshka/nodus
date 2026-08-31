import type { sCoreSequence, tCoreStep } from '@engine/Core/CoreSchema.js';

export type tWorkerCodeStepMatch = (step: tCoreStep) => boolean;

export function previousSteps(
  sequence: sCoreSequence,
  stepNumber: number,
  match: tWorkerCodeStepMatch,
): tCoreStep[] {
  const end = Math.max(0, Math.min(sequence.steps.length, stepNumber - 1));
  return sequence.steps.slice(0, end).filter(match);
}

export function previousStepNumbers(
  sequence: sCoreSequence,
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
