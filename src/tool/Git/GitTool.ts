// GitTool.ts

import { TerminalTool } from '@tool/Terminal/TerminalTool';
import type { Tool } from '@tool/Tool';

export class GitTool implements Tool {
  name = 'git';

  description = 'Inspect and work with Git repositories';

  constructor(private readonly terminal: TerminalTool) {}

  async execute(input: unknown): Promise<unknown> {
    if (typeof input !== 'string') {
      throw new Error('Git command must be a string');
    }

    return this.terminal.execute(`git ${input}`);
  }

  status(cwd: string): Promise<string> {
    return this.terminal.execute('git status --short', cwd);
  }

  diff(cwd: string): Promise<string> {
    return this.terminal.execute('git diff', cwd);
  }
}