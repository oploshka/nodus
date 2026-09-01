import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ActionUserInputCli } from '@app/Cli/ActionUserInputCli.js';
import { CLI_EXIT, runCli } from '@app/Cli/Cli.js';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import {
  CompositeEventSubscriber,
  ConsoleEventSubscriber,
  FileEventSubscriber,
} from '@app/Logging/Logger.js';
import { createModel } from '@app/Model/Model.js';
import { clearProjectIndex, createProject } from '@app/Project/Project.js';
import { AutomationLoader } from '@engine/Core/Automation/AutomationLoader.js';
import { EngineSchema } from '@engine/Core/EngineSchema.js';
import { ENGINE_STEP, type tEngineEmit } from '@engine/Core/EngineSchemaTsType.js';
import type { sEngineGroupConfig } from '@engine/Core/EngineRuntimeTsType.js';
import type { iEngineStep } from '@engine/Core/EngineStepInterface.js';
import { Engine } from '@engine/Engine.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';

interface StartupOptions {
  configPath: string;
  clearCache: boolean;
  clearLogs: boolean;
}

interface sAutomationRuntimePackage {
  groups: Readonly<Record<string, sEngineGroupConfig>>;
  modules: Readonly<Record<string, iEngineStep>>;
}

const ACTION_USER_INPUT_CLI = 'ActionUserInputCli';
const PLANNER = 'Planner';
const CLI_GROUP = 'cli';

async function main(args: string[]): Promise<void> {
  const options = parseStartupOptions(args);
  const configuration = await ConfigurationLoader.load(options.configPath);
  const logDirectory = resolve(process.cwd(), 'log', 'runtime', configuration.target.id);

  if (options.clearLogs) await rm(logDirectory, { recursive: true, force: true });

  const logPath = resolve(logDirectory, `${fileTimestamp()}-nodus.log`);
  const events = new CompositeEventSubscriber([
    new ConsoleEventSubscriber(configuration.language?.response),
    new FileEventSubscriber(logPath),
  ]);
  const emit: tEngineEmit = (event) => events.listener({ event, path: [] });

  emit({
    type: 'app.startup',
    data: {
      projectId: configuration.target.id,
      clearCache: options.clearCache,
      clearLogs: options.clearLogs,
      logPath,
    },
  });

  if (options.clearCache) await clearProjectIndex(configuration.target);

  const model = createModel(configuration.model);
  const target = await createProject(configuration.target, emit);
  const language: LanguageConfiguration = {
    project: configuration.language?.project ?? 'en',
    nodus: configuration.language?.nodus ?? 'en',
    response: configuration.language?.response ?? 'en',
  };

  const automationRoot = configuration.automation?.root ?? 'automation';
  const automation = resolveAutomationRuntime(await AutomationLoader.load(resolve(automationRoot)));
  if (automation.modules[ACTION_USER_INPUT_CLI]) {
    throw new Error(`Automation module '${ACTION_USER_INPUT_CLI}' is reserved by the CLI application.`);
  }
  if (!automation.modules[PLANNER]) {
    throw new Error(`Automation module '${PLANNER}' is not registered.`);
  }

  const engine = new Engine({
    groups: {
      ...automation.groups,
      [CLI_GROUP]: {
        schema: {
          allowedGroups: ['planner'],
        },
      },
    },
    modules: {
      ...automation.modules,
      [ACTION_USER_INPUT_CLI]: new ActionUserInputCli(),
    },
  });
  const dependencies = { target, model, language, onEvent: events.listener };

  await runCli({
    projectId: target.id,
    onRun: async () => {
      const result = await engine.run(createCliSchema(), dependencies);
      if (result.status === 'FAILURE') {
        throw new Error(result.reason ?? 'Execution failed.');
      }
      if (result.output.value === CLI_EXIT) return false;
      if (result.output.value !== undefined) console.log(result.output.value);
      return true;
    },
  });

  emit({ type: 'app.exit' });
}

function createCliSchema(): EngineSchema {
  return new EngineSchema([
    {
      type: ENGINE_STEP.SEQUENCE,
      module: ACTION_USER_INPUT_CLI,
      steps: null,
    },
  ]);
}

function resolveAutomationRuntime(value: Readonly<Record<string, unknown>>): sAutomationRuntimePackage {
  const groups = value.groups;
  const modules = value.modules;

  if (!isRecord(groups)) throw new Error('automation/index.js must export groups.');
  if (!isRecord(modules)) throw new Error('automation/index.js must export modules.');

  return {
    groups: groups as Readonly<Record<string, sEngineGroupConfig>>,
    modules: modules as Readonly<Record<string, iEngineStep>>,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStartupOptions(args: string[]): StartupOptions {
  let configPath = 'nodus.config.json';
  let clearCache = false;
  let clearLogs = false;

  for (const arg of args) {
    if (arg === '--clear-cache') { clearCache = true; continue; }
    if (arg === '--clear-logs') { clearLogs = true; continue; }
    if (!arg.startsWith('--')) configPath = arg;
  }

  return { configPath, clearCache, clearLogs };
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
