import type { Knowledge } from '@knowledge/Knowledge';

export class KnowledgeStore {
  private knowledge?: Knowledge;

  get(): Knowledge | undefined {
    return this.knowledge;
  }

  save(knowledge: Knowledge): void {
    this.knowledge = knowledge;
  }

  clear(): void {
    this.knowledge = undefined;
  }
}