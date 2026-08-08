// HumanInteraction.ts
export interface HumanInteraction {
  ask(question: string): Promise<string>;
}
