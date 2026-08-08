import { promises as fs } from 'node:fs';
import path from 'node:path';

export class FileSystemTool {
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