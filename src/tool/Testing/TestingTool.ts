// TestingTool.ts

import { TerminalTool } from '@tool/Terminal/TerminalTool';
import type { Tool } from '@tool/Tool';

export class TestingTool implements Tool {
  name = 'testing';

  description = 'Run project tests and checks';

  constructor(private readonly terminal: TerminalTool) {}

  async execute(input: unknown): Promise<unknown> {
    if (typeof input !== 'string') {
      throw new Error('Test command must be a string');
    }

    return this.terminal.execute(input);
  }

  run(command: string, cwd: string): Promise<string> {
    return this.terminal.execute(command, cwd);
  }
}