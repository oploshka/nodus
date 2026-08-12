import { readFile } from 'node:fs/promises';
import type { KnowledgeEntry } from '@research/Entry/KnowledgeEntry';
import type { ResearchFact } from '@research/Fact/ResearchFact';

/**
 * Project research memory. Static project knowledge and runtime-resolved facts live here;
 * Planner does not own project knowledge and workers do not research on their own.
 */
export class ResearchStore {
  private entries: KnowledgeEntry[] = [];
  private readonly facts = new Map<string, ResearchFact>();

  public async load(path?: string): Promise<void> {
    if (!path) {
      this.entries = [];
      return;
    }

    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as KnowledgeEntry[];
      this.entries = parsed;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        this.entries = [];
        return;
      }
      throw error;
    }
  }

  public all(): KnowledgeEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  public getFact(key: string): ResearchFact | undefined {
    const fact = this.facts.get(key);
    return fact ? { ...fact, sources: [...fact.sources] } : undefined;
  }

  public putFact(fact: Omit<ResearchFact, 'createdAt'> & { createdAt?: string }): ResearchFact {
    const stored: ResearchFact = {
      ...fact,
      sources: Array.from(new Set(fact.sources)),
      createdAt: fact.createdAt ?? new Date().toISOString(),
    };
    this.facts.set(stored.key, stored);
    return { ...stored, sources: [...stored.sources] };
  }

  public allFacts(): ResearchFact[] {
    return Array.from(this.facts.values()).map((fact) => ({ ...fact, sources: [...fact.sources] }));
  }

  public invalidateBySource(source: string): string[] {
    const removed: string[] = [];
    for (const [key, fact] of this.facts) {
      if (!fact.sources.includes(source)) continue;
      this.facts.delete(key);
      removed.push(key);
    }
    return removed;
  }

  public clearFacts(): void {
    this.facts.clear();
  }
}
