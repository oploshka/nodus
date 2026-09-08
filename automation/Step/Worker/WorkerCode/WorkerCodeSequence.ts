export type tWorkerCodeStepMatch<TStep> = (step: TStep) => boolean;

export function previousSteps<TStep>(
  sequence: readonly TStep[],
  stepNumber: number,
  match: tWorkerCodeStepMatch<TStep>,
): TStep[] {
  const end = Math.max(0, Math.min(sequence.length, stepNumber - 1));
  return sequence.slice(0, end).filter(match);
}

export function previousStepNumbers<TStep>(
  sequence: readonly TStep[],
  stepNumber: number,
  match: tWorkerCodeStepMatch<TStep>,
): number[] {
  const end = Math.max(0, Math.min(sequence.length, stepNumber - 1));
  const result: number[] = [];

  for (let index = 0; index < end; index += 1) {
    const step = sequence[index];
    if (step !== undefined && match(step)) result.push(index + 1);
  }

  return result;
}
