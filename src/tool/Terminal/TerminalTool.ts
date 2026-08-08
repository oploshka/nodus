// TerminalTool.ts

import { exec } from 'node:child_process';
import type { Tool } from '@tool/Tool';

export class TerminalTool implements Tool {
  name = 'terminal';

  description = 'Execute terminal commands';

  async execute(input: unknown): Promise<unknown> {
    if (typeof input !== 'string') {
      throw new Error('Terminal command must be a string');
    }

    return new Promise((resolve, reject) => {
      exec(input, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout);
      });
    });
  }
}