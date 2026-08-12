// GitTool.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';

const execFileAsync = promisify(execFile);

export class GitTool implements Tool {
  public readonly definition = {
    id: 'git',
    description: 'Read git status, diff, or recent log for the project.',
    inputSchema: {
      action: 'status | diff | log',
      args: 'optional string array',
    },
  };

  public async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const action = String(input.action ?? 'status');
      const extra = Array.isArray(input.args) ? input.args.map(String) : [];
      let args: string[];

      switch (action) {
        case 'status':
          args = ['status', '--short', ...extra];
          break;
        case 'diff':
          args = ['diff', ...extra];
          break;
        case 'log':
          args = ['log', '--oneline', '-n', '20', ...extra];
          break;
        default:
          return { ok: false, error: `Unknown git action: ${action}` };
      }

      const result = await execFileAsync('git', args, { cwd: context.projectRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      return { ok: true, data: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      const value = error as Error & { stdout?: string; stderr?: string };
      return { ok: false, error: value.message, data: { stdout: value.stdout, stderr: value.stderr } };
    }
  }
}
