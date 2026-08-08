// Cli.ts
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { Nodus } from '@core/Nodus/Nodus';

// Определяем единый источник данных для команд
const COMMANDS = [
  { name: '/scan', description: 'Scan project files.' },
  { name: '/refresh', description: 'Refresh project files.' },
  { name: '/conversation', description: 'Show current conversation ID.' },
  { name: '/new', description: 'Create a new conversation.' },
  { name: '/exit', description: 'Exit the CLI.' },
  { name: '/help', description: 'Show this help message.' }
];

class ConsoleHumanInteraction implements HumanInteraction {
  public constructor(private readonly readline: ReturnType<typeof createInterface>) {}

  public async ask(question: string): Promise<string> {
    return this.readline.question(`\nNodus asks: ${question}\n> `);
  }
}

export async function runCli(args: string[]): Promise<void> {
  const configPath = args[0] ?? 'nodus.config.json';
  const readline = createInterface({ input, output });

  try {
    const configuration = await ConfigurationLoader.load(configPath);
    const human = new ConsoleHumanInteraction(readline);
    const nodus = new Nodus(configuration, human);
    await nodus.initialize();

    let conversation = nodus.createConversation();
    console.log(`Nodus v0.1 ready. Project: ${configuration.project.id}`);
    console.log(`Conversation: ${conversation.id}`);
    console.log('Commands: ' + COMMANDS.map(cmd => cmd.name).join(' '));

    while (true) {
      const value = (await readline.question('\n> ')).trim();
      if (!value) {
        continue;
      }

      if (value === '/exit') {
        break;
      }
      if (value === '/scan') {
        const index = await nodus.projectSession.scan();
        console.log(`Scanned ${index.files.length} files.`);
        continue;
      }
      if (value === '/refresh') {
        const index = await nodus.projectSession.refresh();
        console.log(`Refreshed ${index.files.length} files.`);
        continue;
      }
      if (value === '/conversation') {
        console.log(conversation.id);
        continue;
      }
      if (value === '/new') {
        conversation = nodus.createConversation();
        console.log(`Conversation: ${conversation.id}`);
        continue;
      }
      if (value === '/help') {
        console.log('\nAvailable commands:');
        COMMANDS.forEach(cmd => {
          console.log(`${cmd.name} - ${cmd.description}`);
        });
        console.log();
        continue;
      }

      try {
        const result = await nodus.runTask(value, conversation.id);
        console.log(`\n${result}`);
      } catch (error) {
        console.error(`Task failed: ${String(error)}`);
      }
    }
  } finally {
    readline.close();
  }
}