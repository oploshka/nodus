// Rag.ts

import type { ProjectIndex } from '@knowledge/Index/ProjectIndex';
import type { RagResult } from '@knowledge/Rag/RagResult';

export class Rag {
  private index?: ProjectIndex;

  async build(index: ProjectIndex): Promise<void> {
    this.index = index;
  }

  async search(
    query: string,
    topK = 5,
  ): Promise<RagResult[]> {
    if (!this.index) {
      return [];
    }

    return this.index.files
      .slice(0, topK)
      .map((file, index) => ({
        path: file.path,
        score: 1 - index * 0.1,
      }));
  }
}