// FileSystemTool.ts
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { Tool, ToolContext, ToolResult } from '@model/Tool/Tool.js';

export class FileSystemTool implements Tool {
  public readonly definition = {
    id: 'file-system',
    description: 'Read, write, list, delete, or check project files. Paths are relative to project root.',
    inputSchema: {
      action: 'read | write | list | delete | exists',
      path: 'string',
      content: 'string, required for write',
    },
  };

  public async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const action = String(input.action ?? '');
      const path = String(input.path ?? '');
      const absolutePath = this.safePath(context.projectRoot, path);

      switch (action) {
        case 'read':
          return { ok: true, data: await readFile(absolutePath, 'utf8') };
        case 'write': {
          const content = String(input.content ?? '');
          await mkdir(dirname(absolutePath), { recursive: true });
          await writeFile(absolutePath, content, 'utf8');
          return { ok: true, data: { path } };
        }
        case 'list': {
          const entries = await readdir(absolutePath, { withFileTypes: true });
          return {
            ok: true,
            data: entries.map((entry: { name: string; isDirectory(): boolean }) => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })),
          };
        }
        case 'delete':
          await rm(absolutePath, { recursive: true, force: true });
          return { ok: true, data: { path } };
        case 'exists': {
          try {
            const value = await stat(absolutePath);
            return { ok: true, data: { exists: true, type: value.isDirectory() ? 'directory' : 'file' } };
          } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT') {
              return { ok: true, data: { exists: false } };
            }
            throw error;
          }
        }
        default:
          return { ok: false, error: `Unknown file-system action: ${action}` };
      }
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  private safePath(root: string, path: string): string {
    const resolvedRoot = resolve(root);
    const absolutePath = resolve(resolvedRoot, path || '.');
    const relativePath = relative(resolvedRoot, absolutePath);

    if (relativePath.startsWith('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
      throw new Error(`Path escapes project root: ${path}`);
    }

    return absolutePath;
  }
}
