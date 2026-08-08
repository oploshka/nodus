import { TerminalTool } from '@tool/Terminal/TerminalTool';

export class TestingTool {
  constructor(private readonly terminal: TerminalTool) {}

  run(command: string, cwd: string): Promise<string> {
    return this.terminal.execute(command, cwd);
  }
}