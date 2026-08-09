// Cli.ts
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { Nodus } from '@core/Nodus/Nodus';

const STATUS_SCENARIO_TASK = 'Добавь команду /status в CLI. Команда должна выводить текущий ID проекта, ID текущего conversation и количество файлов в индексе проекта, если индекс доступен. Используй существующие API и структуры проекта, не дублируй уже существующую логику получения этих данных. Не изменяй ничего, что не требуется для этой задачи.';

const STATUS_SCENARIO_PLAN: TaskPlan = {
  version: 2,
  goal: 'add /status CLI command to display project ID, conversation ID, and index file count',
  steps: [
    {
      id: 'step-1',
      type: 'search',
      action: 'find-definitions',
      subject: 'project ID source in ProjectSession.ts',
      goal: 'Найти определения: project ID source in ProjectSession.ts',
      status: 'pending',
      maxAttempts: 1,
      inputs: [],
      outputs: ['projectId.source'],
    },
    {
      id: 'step-2',
      type: 'search',
      action: 'find-definitions',
      subject: 'conversation ID source in Conversation.ts',
      goal: 'Найти определения: conversation ID source in Conversation.ts',
      status: 'pending',
      maxAttempts: 1,
      inputs: [],
      outputs: ['conversationId.source'],
    },
    {
      id: 'step-3',
      type: 'search',
      action: 'find-usages',
      subject: 'ProjectIndex class in ProjectIndex.ts',
      goal: 'Найти использования: ProjectIndex class in ProjectIndex.ts',
      status: 'pending',
      maxAttempts: 1,
      inputs: [],
      outputs: ['indexFileCount.source'],
    },
    {
      id: 'step-4',
      type: 'understand',
      action: 'identify-pattern',
      subject: 'CLI command registration pattern in Cli.ts',
      goal: 'Определить существующий паттерн: CLI command registration pattern in Cli.ts',
      status: 'pending',
      maxAttempts: 1,
      inputs: [],
      outputs: ['cliCommandPattern'],
    },
    {
      id: 'step-5',
      type: 'prepare-change',
      action: 'define-change',
      subject: 'new /status command implementation',
      goal: 'Определить точное изменение: new /status command implementation',
      status: 'pending',
      maxAttempts: 1,
      inputs: ['projectId.source', 'conversationId.source', 'indexFileCount.source', 'cliCommandPattern'],
      outputs: ['changeDefinition'],
    },
    {
      id: 'step-6',
      type: 'edit-file',
      action: 'apply-change',
      subject: 'Cli.ts',
      goal: 'Применить изменение: Cli.ts',
      status: 'pending',
      maxAttempts: 3,
      inputs: ['changeDefinition'],
      outputs: ['step-6.result'],
    },
    {
      id: 'step-7',
      type: 'finalize',
      action: 'summarize-result',
      subject: 'added /status CLI command',
      goal: 'Сообщить результат: added /status CLI command',
      status: 'pending',
      maxAttempts: 1,
      inputs: [],
      outputs: ['step-7.result'],
    },
  ],
};

// Определяем единый источник данных для команд
const COMMANDS = [
  { name: '/scan', description: 'Scan project files.' },
  { name: '/refresh', description: 'Refresh project files.' },
  { name: '/conversation', description: 'Show current conversation ID.' },
  { name: '/new', description: 'Create a new conversation.' },
  { name: '/exit', description: 'Exit the CLI.' },
  { name: '/help', description: 'Show this help message.' },
  { name: '/resume', description: 'Resume the last paused execution. Optional text after the command is used as a hint.' },
  { name: '/stop', description: 'Stop and discard the last paused execution.' }
];

class ConsoleHumanInteraction implements HumanInteraction {
  public constructor(private readonly readline: ReturnType<typeof createInterface>) {}

  public async ask(question: string): Promise<string> {
    return this.readline.question(`\nNodus asks: ${question}\n> `);
  }
}

export async function runCli(args: string[]): Promise<void> {
  const startup = parseStartupArgs(args);
  const readline = createInterface({ input, output });

  try {
    const configuration = await ConfigurationLoader.load(startup.configPath);
    if (startup.clearCache !== undefined) configuration.project.clearCacheOnStart = startup.clearCache;
    if (startup.clearLogs !== undefined) configuration.logging.clearOnStart = startup.clearLogs;
    if (startup.scan) configuration.project.scanMode = 'on-open';
    const human = new ConsoleHumanInteraction(readline);
    const nodus = new Nodus(configuration, human);
    await nodus.initialize();

    let conversation = nodus.createConversation();
    console.log(`Nodus v0.1 ready. Project: ${configuration.project.id}`);
    console.log(`Conversation: ${conversation.id}`);
    console.log('Commands: ' + COMMANDS.map(cmd => cmd.name).join(' '));

    if (startup.scenario) {
      const scenario = resolveStartupScenario(startup.scenario);
      console.log(`Scenario: ${startup.scenario} (fixed task + fixed plan)`);
      await nodus.runTask(scenario.task, conversation.id, undefined, scenario.plan);
      return;
    }

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
      if (value === '/stop') {
        console.log(nodus.stopPausedTask(conversation.id) ? 'Paused execution stopped.' : 'No paused execution.');
        continue;
      }

      const resume = parseResumeInput(value);
      if ((resume.requested || value.startsWith('/resume')) && nodus.hasPausedExecution(conversation.id)) {
        const hint = value.startsWith('/resume') ? value.slice('/resume'.length).trim() : resume.hint;
        await nodus.resumeTask(conversation.id, hint || undefined);
        continue;
      }

      try {
        await nodus.runTask(value, conversation.id);
      } catch (error) {
        console.error(`Task failed: ${String(error)}`);
      }
    }
  } finally {
    readline.close();
  }
}
function parseResumeInput(value: string): { requested: boolean; hint?: string } {
  const match = value.match(/^(?:продолжи(?:\s+выполнение)?|продолжить(?:\s+выполнение)?|continue|retry|попробуй\s+(?:ещ[её]\s+раз|снова))(?:\s*[,.:;-]\s*|\s+)?(.*)$/i);
  if (!match) return { requested: false };
  const hint = match[1]?.trim();
  return { requested: true, hint: hint || undefined };
}


interface StartupArguments {
  configPath: string;
  clearCache?: boolean;
  clearLogs?: boolean;
  scan: boolean;
  scenario?: string;
}

function parseStartupArgs(args: string[]): StartupArguments {
  let configPath = 'nodus.config.json';
  let clearCache: boolean | undefined;
  let clearLogs: boolean | undefined;
  let scan = false;
  let scenario: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--clear-cache') {
      clearCache = true;
      continue;
    }
    if (arg === '--keep-cache') {
      clearCache = false;
      continue;
    }
    if (arg === '--clear-logs') {
      clearLogs = true;
      continue;
    }
    if (arg === '--keep-logs') {
      clearLogs = false;
      continue;
    }
    if (arg === '--scan') {
      scan = true;
      continue;
    }
    if (arg === '--scenario') {
      scenario = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--scenario=')) {
      scenario = arg.slice('--scenario='.length).trim() || undefined;
      continue;
    }
    if (!arg.startsWith('--')) configPath = arg;
  }

  return { configPath, clearCache, clearLogs, scan, scenario };
}

function resolveStartupScenario(name: string): { task: string; plan: TaskPlan } {
  if (name === 'status') {
    return { task: STATUS_SCENARIO_TASK, plan: STATUS_SCENARIO_PLAN };
  }
  throw new Error(`Unknown startup scenario: ${name}`);
}
