// KnowledgeStore.ts
import { readFile } from 'node:fs/promises';
import type { KnowledgeEntry } from '@knowledge/Entry/KnowledgeEntry';

export class KnowledgeStore {
  private entries: KnowledgeEntry[] = [];

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
}
