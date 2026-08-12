import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Bootstrap } from '../Bootstrap.js';
import { ConfigurationLoader } from '../config/ConfigurationLoader.js';

export async function runCli(configPath: string): Promise<void> {
  const configuration = await ConfigurationLoader.load(configPath);
  const app = await Bootstrap.create(configuration);
  const readline = createInterface({ input, output });

  console.log(`Nodus 0.3 runtime spike. Project: ${configuration.project.id}`);
  console.log('Commands: /help /scan /exit');

  try {
    while (true) {
      const value = (await readline.question('\n> ')).trim();
      if (!value) continue;
      if (value === '/exit') break;
      if (value === '/help') {
        console.log('/scan - refresh project index\n/exit - exit\nAny other input is sent to engine.runTask().');
        continue;
      }
      if (value === '/scan') {
        const index = await app.project.scan();
        console.log(`Indexed ${index.files.length} files.`);
        continue;
      }

      const run = await app.engine.runTask(value);
      const last = run.steps.at(-1)?.result;
      console.log(last?.status === 'completed' ? last.summary : last?.error ?? run.status);
    }
  } finally {
    readline.close();
  }
}
