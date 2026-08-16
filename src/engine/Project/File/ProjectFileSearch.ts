import type { ProjectFileIndex, ProjectFileInfo } from './ProjectFileIndex.js';

/** Cheap lexical search over the current ProjectFileIndex. */
export class ProjectFileSearch {
  public constructor(private readonly index: () => ProjectFileIndex | undefined) {}

  public search(question: string, limit = 6): ProjectFileInfo[] {
    const files = this.index()?.files ?? [];
    const tokens = Array.from(new Set(question.toLowerCase().match(/[a-zа-яё0-9_$-]{3,}/gi) ?? []));
    const scored = files.map((file) => {
      const haystack = [file.path, ...file.imports, ...file.exports].join(' ').toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (file.path.toLowerCase().includes(token)) score += 5;
        if (haystack.includes(token)) score += 2;
      }
      if (/cli|command/.test(question.toLowerCase()) && /Cli/i.test(file.path)) score += 8;
      if (/conversation/.test(question.toLowerCase()) && /conversation/i.test(file.path)) score += 8;
      if (/index|project/.test(question.toLowerCase()) && /project|index/i.test(file.path)) score += 4;
      return { file, score };
    });
    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
      .slice(0, limit)
      .map((item) => item.file);
  }
}
