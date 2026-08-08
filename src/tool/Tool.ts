export interface Tool {
  name: string;
  description: string;
  execute(input: unknown): Promise<unknown>;
}