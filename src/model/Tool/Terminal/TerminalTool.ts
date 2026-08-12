// TerminalTool.ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { relative, resolve } from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';

const execAsync = promisify(exec);

export class TerminalTool implements Tool {
  public readonly definition = {
    id: 'terminal',
    description: 'Execute a shell command inside the project root or one of its subdirectories.',
    inputSchema: {
      command: 'string',
      cwd: 'optional project-relative directory',
      timeoutMs: 'optional number, default 30000, max 120000',
    },
  };

  public async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const command = String(input.command ?? '').trim();
      if (!command) {
        return { ok: false, error: 'terminal.command is required' };
      }

      const cwd = this.safeCwd(context.projectRoot, String(input.cwd ?? '.'));
      const timeout = Math.min(Math.max(Number(input.timeoutMs ?? 30000), 1000), 120000);
      const result = await execAsync(command, { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      return { ok: true, data: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      const value = error as Error & { stdout?: string; stderr?: string; code?: number | string };
      return {
        ok: false,
        error: value.message,
        data: { stdout: value.stdout, stderr: value.stderr, code: value.code },
      };
    }
  }

  private safeCwd(root: string, cwd: string): string {
    const resolvedRoot = resolve(root);
    const absolutePath = resolve(resolvedRoot, cwd);
    const relativePath = relative(resolvedRoot, absolutePath);
    if (relativePath.startsWith('..')) {
      throw new Error(`cwd escapes project root: ${cwd}`);
    }
    return absolutePath;
  }
}
