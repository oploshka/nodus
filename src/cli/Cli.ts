// Cli.ts
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { RequirementMap } from '@planner/RequirementMap';
import { STATUS_SCENARIO_REQUIREMENTS, STATUS_SCENARIO_TASK } from '@planner/Scenario/StatusScenario';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { Nodus } from '@core/Nodus/Nodus';

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
    console.log(`Nodus v0.3.0 ready. Project: ${configuration.project.id}`);
    console.log(`Conversation: ${conversation.id}`);
    console.log('Commands: ' + COMMANDS.map(cmd => cmd.name).join(' '));

    if (startup.scenario) {
      const scenario = resolveStartupScenario(startup.scenario);
      console.log(`Scenario: ${startup.scenario} (fixed task + fixed requirement map)`);
      await nodus.runTask(scenario.task, conversation.id, undefined, scenario.requirements);
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

function resolveStartupScenario(name: string): { task: string; requirements: RequirementMap } {
  if (name === 'status') {
    return { task: STATUS_SCENARIO_TASK, requirements: STATUS_SCENARIO_REQUIREMENTS };
  }
  throw new Error(`Unknown startup scenario: ${name}`);
}
