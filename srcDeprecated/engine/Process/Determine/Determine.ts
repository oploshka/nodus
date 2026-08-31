import type { DeterminePresentation } from '@engine/Presentation/DeterminePresentation.js';
export interface DetermineOption<T> {
  id: string;
  description: string;
  value: T;
}

export interface DetermineRequest<T> {
  goal: string;
  options: ReadonlyArray<DetermineOption<T>>;
}

/** Atomic Engine service: choose one best option from a bounded list. */
export interface Determine {
  readonly presentation: DeterminePresentation;
  option<T>(request: DetermineRequest<T>): Promise<T>;
}
