import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { Engine } from '@engine/Engine.js';

export interface CliRuntime {
  engine: Engine;
  projectId: string;
  scanProject(): Promise<number>;
}

export async function runCli(runtime: CliRuntime): Promise<void> {
  const readline = createInterface({ input, output });

  console.log(`Nodus 0.3 runtime spike. Project: ${runtime.projectId}`);
  console.log('Commands: /help /scan /exit');

  try {
    while (true) {
      const value = (await readline.question('\n> ')).trim();
      if (!value) continue;
      if (value === '/exit') break;
      if (value === '/help') {
        console.log('/scan - refresh project index\n/exit - exit\nAny other input is sent to engine.run().');
        continue;
      }
      if (value === '/scan') {
        console.log(`Indexed ${await runtime.scanProject()} files.`);
        continue;
      }

      const run = await runtime.engine.run(value);
      const last = run.steps.at(-1)?.result;
      console.log(last?.status === 'completed' ? last.summary : last?.error ?? run.status);
    }
  } finally {
    readline.close();
  }
}
