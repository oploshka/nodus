import { TerminalTool } from '@tool/Terminal/TerminalTool';

export class GitTool {
  constructor(private readonly terminal: TerminalTool) {}

  status(cwd: string): Promise<string> {
    return this.terminal.execute('git status --short', cwd);
  }

  diff(cwd: string): Promise<string> {
    return this.terminal.execute('git diff', cwd);
  }
}