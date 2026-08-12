export interface Worker<State, Context> {
  readonly id: string;
  execute(state: State, context: Context): Promise<State>;
}
