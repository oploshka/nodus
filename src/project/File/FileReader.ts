// FileReader.ts

import { promises as fs } from 'node:fs';
import type { ProjectFile } from '@project/File/ProjectFile';

export class FileReader {
  async read(path: string): Promise<ProjectFile> {
    const [content, stat] = await Promise.all([
      fs.readFile(path, 'utf-8'),
      fs.stat(path),
    ]);

    const extension = path.includes('.')
      ? `.${path.split('.').pop()}`
      : '';

    return {
      path,
      extension,
      size: stat.size,
      content,
    };
  }
}