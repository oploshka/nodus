import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ActionUserInputCli } from '@app/Cli/ActionUserInputCli.js';
import { runCli } from '@app/Cli/Cli.js';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import { CompositeLogger, ConsoleLogger, FileLogger } from '@app/Logging/Logger.js';
import { createModel } from '@app/Model/Model.js';
import { clearProjectIndex, createProject } from '@app/Project/Project.js';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';
import { CORE_STEP, type sCoreSequence } from '@engine/Core/CoreSchema.js';
import type {
  sCoreGroupConfig,
  tCoreModuleDefinition,
} from '@engine/Core/CoreTsType.js';
import { Engine } from '@engine/Engine.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';

interface StartupOptions {
  configPath: string;
  clearCache: boolean;
  clearLogs: boolean;
}

interface sAutomationRuntimePackage {
  start: string;
  groups: Readonly<Record<string, sCoreGroupConfig>>;
  modules: Readonly<Record<string, tCoreModuleDefinition>>;
}

const ACTION_USER_INPUT_CLI = 'ActionUserInputCli';

async function main(args: string[]): Promise<void> {
  const options = parseStartupOptions(args);
  const configuration = await ConfigurationLoader.load(options.configPath);
  const logDirectory = resolve(process.cwd(), 'log', 'runtime', configuration.target.id);

  if (options.clearLogs) await rm(logDirectory, { recursive: true, force: true });

  const logPath = resolve(logDirectory, `${fileTimestamp()}-nodus.log`);
  const logger = new CompositeLogger([
    new ConsoleLogger(configuration.language?.response),
    new FileLogger(logPath),
  ]);

  logger.info('app.startup', {
    projectId: configuration.target.id,
    clearCache: options.clearCache,
    clearLogs: options.clearLogs,
    logPath,
  });

  if (options.clearCache) await clearProjectIndex(configuration.target);

  const model = createModel(configuration.model);
  const target = await createProject(configuration.target, logger);
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
  if (!automation.modules[automation.start]) {
    throw new Error(`Automation start module '${automation.start}' is not registered.`);
  }

  const engine = new Engine({
    groups: automation.groups,
    modules: {
      ...automation.modules,
      [ACTION_USER_INPUT_CLI]: new ActionUserInputCli(),
    },
  });
  const dependencies = { target, logger, model, language };

  await runCli({
    projectId: target.id,
    onInput: async (value) => {
      const result = await engine.run(createCliSequence(value, automation.start), dependencies);
      if (result.status === 'FAILURE') {
        throw new Error(result.reason ?? 'Execution failed.');
      }
    },
  });

  logger.info('app.exit');
}

function createCliSequence(input: string, start: string): sCoreSequence {
  return {
    type: CORE_STEP.SEQUENCE,
    task: input,
    steps: [
      {
        module: ACTION_USER_INPUT_CLI,
        input: { context: { parent: true } },
      },
      {
        module: start,
        input: { context: { parent: true, previous: true } },
      },
    ],
  };
}

function resolveAutomationRuntime(value: Readonly<Record<string, unknown>>): sAutomationRuntimePackage {
  const start = value.start;
  const groups = value.groups;
  const modules = value.modules;

  if (typeof start !== 'string' || !start.trim()) {
    throw new Error('automation/index.js must export a non-empty start module id.');
  }
  if (!isRecord(groups)) throw new Error('automation/index.js must export groups.');
  if (!isRecord(modules)) throw new Error('automation/index.js must export modules.');

  return {
    start,
    groups: groups as Readonly<Record<string, sCoreGroupConfig>>,
    modules: modules as Readonly<Record<string, tCoreModuleDefinition>>,
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
