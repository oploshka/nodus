// SearchTool.ts
import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { Tool, ToolContext, ToolResult } from '@model/Tool/Tool.js';

interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

export class SearchTool implements Tool {
  public readonly definition = {
    id: 'search',
    description: 'Search text recursively in project files without requiring ripgrep.',
    inputSchema: {
      query: 'string',
      path: 'optional project-relative directory',
      maxResults: 'optional number, default 50, max 200',
      caseSensitive: 'optional boolean',
    },
  };

  public async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const query = String(input.query ?? '');
      if (!query) {
        return { ok: false, error: 'search.query is required' };
      }

      const start = this.safePath(context.projectRoot, String(input.path ?? '.'));
      const maxResults = Math.min(Math.max(Number(input.maxResults ?? 50), 1), 200);
      const caseSensitive = Boolean(input.caseSensitive ?? false);
      const matches: SearchMatch[] = [];

      await this.walk(context.projectRoot, start, query, caseSensitive, maxResults, context.exclude, matches);
      return { ok: true, data: matches };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  private async walk(
    root: string,
    directory: string,
    query: string,
    caseSensitive: boolean,
    maxResults: number,
    exclude: string[],
    matches: SearchMatch[],
  ): Promise<void> {
    if (matches.length >= maxResults) {
      return;
    }

    const info = await stat(directory);
    if (info.isFile()) {
      await this.searchFile(root, directory, query, caseSensitive, maxResults, matches);
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (matches.length >= maxResults) {
        return;
      }

      const absolutePath = resolve(directory, entry.name);
      const projectPath = this.normalize(relative(root, absolutePath));
      if (this.isExcluded(projectPath, exclude)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.walk(root, absolutePath, query, caseSensitive, maxResults, exclude, matches);
      } else if (entry.isFile()) {
        await this.searchFile(root, absolutePath, query, caseSensitive, maxResults, matches);
      }
    }
  }

  private async searchFile(
    root: string,
    path: string,
    query: string,
    caseSensitive: boolean,
    maxResults: number,
    matches: SearchMatch[],
  ): Promise<void> {
    const info = await stat(path);
    if (info.size > 1024 * 1024) {
      return;
    }

    let content: string;
    try {
      content = await readFile(path, 'utf8');
    } catch {
      return;
    }

    const needle = caseSensitive ? query : query.toLowerCase();
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const haystack = caseSensitive ? line : line.toLowerCase();
      if (haystack.includes(needle)) {
        matches.push({ path: this.normalize(relative(root, path)), line: index + 1, text: line.trim().slice(0, 500) });
        if (matches.length >= maxResults) {
          return;
        }
      }
    }
  }

  private isExcluded(path: string, exclude: string[]): boolean {
    return exclude.some((item) => {
      const normalized = this.normalize(item).replace(/\/$/, '');
      return path === normalized || path.startsWith(`${normalized}/`) || path.split('/').includes(normalized);
    });
  }

  private safePath(root: string, path: string): string {
    const resolvedRoot = resolve(root);
    const absolutePath = resolve(resolvedRoot, path);
    const relativePath = relative(resolvedRoot, absolutePath);
    if (relativePath.startsWith('..')) {
      throw new Error(`Search path escapes project root: ${path}`);
    }
    return absolutePath;
  }

  private normalize(path: string): string {
    return path.split(sep).join('/');
  }
}
