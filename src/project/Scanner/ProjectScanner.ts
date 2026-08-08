// ProjectScanner.ts

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Project } from '@project/Project';

export class ProjectScanner {
  private readonly ignored = new Set([
    'node_modules',
    'dist',
    '.git',
    '.idea',
  ]);

  async scan(root: string): Promise<Project> {
    const files: string[] = [];

    await this.scanDirectory(root, root, files);

    return {
      root,
      files,
      configuration: {},
    };
  }

  private async scanDirectory(
    root: string,
    directory: string,
    files: string[],
  ): Promise<void> {
    const entries = await fs.readdir(directory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (this.ignored.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(root, fullPath, files);
        continue;
      }

      files.push(path.relative(root, fullPath));
    }
  }
}