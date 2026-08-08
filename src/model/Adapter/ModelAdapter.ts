export interface ModelAdapter {
  send(prompt: string): Promise<string>;
}