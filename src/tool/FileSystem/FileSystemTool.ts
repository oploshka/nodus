// FileSystemTool.ts

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Tool } from '@tool/Tool';

export class FileSystemTool implements Tool {
  name = 'filesystem';

  description = 'Read, write, check and list files';

  async execute(input: unknown): Promise<unknown> {
    if (!input || typeof input !== 'object') {
      throw new Error('Filesystem input must be an object');
    }

    const data = input as {
      action?: string;
      path?: string;
      content?: string;
    };

    switch (data.action) {
      case 'read':
        if (!data.path) {
          throw new Error('File path is required');
        }

        return this.read(data.path);

      case 'write':
        if (!data.path || data.content === undefined) {
          throw new Error('File path and content are required');
        }

        await this.write(data.path, data.content);
        return 'File written';

      case 'exists':
        if (!data.path) {
          throw new Error('File path is required');
        }

        return this.exists(data.path);

      case 'list':
        if (!data.path) {
          throw new Error('Directory path is required');
        }

        return this.list(data.path);

      default:
        throw new Error(`Unknown filesystem action: ${data.action}`);
    }
  }

  async read(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async write(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory);

    return entries.map((entry) => path.join(directory, entry));
  }
}