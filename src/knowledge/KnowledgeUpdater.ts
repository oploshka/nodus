import type { Knowledge } from '@knowledge/Knowledge';

export class KnowledgeUpdater {
  update(
    knowledge: Knowledge,
    filePath: string,
    understanding: string
  ): Knowledge {
    return {
      ...knowledge,
      files: {
        ...knowledge.files,
        [filePath]: understanding
      }
    };
  }
}