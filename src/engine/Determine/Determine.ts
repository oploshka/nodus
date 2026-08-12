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
  option<T>(request: DetermineRequest<T>): Promise<T>;
}
