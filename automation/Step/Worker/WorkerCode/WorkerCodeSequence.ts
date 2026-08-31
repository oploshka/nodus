import type { sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';

export type tWorkerCodeStepMatch = (step: sEngineSchemaStep) => boolean;

export function previousSteps(
  sequence: sEngineSchemaStep[],
  stepNumber: number,
  match: tWorkerCodeStepMatch,
): sEngineSchemaStep[] {
  const end = Math.max(0, Math.min(sequence.length, stepNumber - 1));
  return sequence.slice(0, end).filter(match);
}

export function previousStepNumbers(
  sequence: sEngineSchemaStep[],
  stepNumber: number,
  match: tWorkerCodeStepMatch,
): number[] {
  const end = Math.max(0, Math.min(sequence.length, stepNumber - 1));
  const result: number[] = [];

  for (let index = 0; index < end; index += 1) {
    const step = sequence[index];
    if (step && match(step)) result.push(index + 1);
  }

  return result;
}
