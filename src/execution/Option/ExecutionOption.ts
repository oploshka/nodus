export interface ExecutionOption<State> {
  readonly id: string;
  readonly workerId: string;
  isAvailable(state: State): boolean;
}
