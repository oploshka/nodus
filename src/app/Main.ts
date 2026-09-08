import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AutomationLoader } from '@app/Automation/AutomationLoader.js';
import { CLI_EXIT, readCliInput, runCli } from '@app/Cli/Cli.js';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import {
  CompositeEventSubscriber,
  ConsoleEventSubscriber,
  FileEventSubscriber,
} from '@app/Logging/Logger.js';
import { createModel } from '@app/Model/Model.js';
import {
  clearProjectIndex,
  createProject,
  type iProjectRuntime,
} from '@app/Project/Project.js';
import type { tEngineEmit } from '@engine/EngineEvent.js';
import { EngineRuntime } from '@engine/EngineRuntime.js';
import type { iEngineStep, tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { ProjectEditor } from '@engine/Process/Edit/ProjectEditor.js';
import { EditStrategyDiff } from '@engine/Process/Edit/Strategy/EditStrategyDiff.js';
import { EditStrategyRangeReplace } from '@engine/Process/Edit/Strategy/EditStrategyRangeReplace.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';

interface StartupOptions {
  configPath: string;
  clearCache: boolean;
  clearLogs: boolean;
  scan: boolean;
}

interface sAutomationRuntimePackage {
  root: iEngineStep;
}

const EDIT_GUIDANCE = 'Implement only the accepted semantic edit. Preserve unrelated project content.';

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
      scan: options.scan,
      logPath,
    },
  });

  if (options.clearCache) await clearProjectIndex(configuration.target);

  const model = createModel(configuration.model);
  const target = await createProject(
    options.scan
      ? { ...configuration.target, scanMode: 'on-open' }
      : configuration.target,
    emit,
  );
  const language: LanguageConfiguration = {
    project: configuration.language?.project ?? 'en',
    nodus: configuration.language?.nodus ?? 'en',
    response: configuration.language?.response ?? 'en',
  };

  const automationDirectory = configuration.automation?.root ?? 'automation';
  const automation = resolveAutomationRuntime(
    await AutomationLoader.load(resolve(automationDirectory)),
  );
  const runtime = new EngineRuntime();

  await runCli({
    projectId: target.id,
    onRun: async () => {
      const input = await readCliInput();
      if (input === CLI_EXIT) return false;

      const edit = createRunEdit(target, model, language);
      const dependencies: tEngineRunDependencies = {
        target,
        model,
        language,
        edit,
        onEvent: events.listener,
      };

      const result = await runtime.run(automation.root, input, dependencies);
      const applied = await edit.apply(undefined, emit);
      if (applied.status === 'not-completed') {
        throw new Error(applied.reason);
      }

      if (result !== undefined) console.log(result);
      return true;
    },
  });

  emit({ type: 'app.exit' });
}

function createRunEdit(
  target: iProjectRuntime,
  model: ModelRunner,
  language: LanguageConfiguration,
): ProjectEditor {
  return new ProjectEditor(target.fileSystem, [
    new EditStrategyRangeReplace(target.fileSystem, model, language, EDIT_GUIDANCE),
    new EditStrategyDiff(model, language, EDIT_GUIDANCE),
  ]);
}

function resolveAutomationRuntime(
  value: Readonly<Record<string, unknown>>,
): sAutomationRuntimePackage {
  if (!isEngineStep(value.root)) {
    throw new Error('automation/index.js must export root EngineStep.');
  }

  return { root: value.root };
}

function isEngineStep(value: unknown): value is iEngineStep {
  if (typeof value !== 'object' || value === null) return false;
  const step = value as Partial<iEngineStep>;
  return typeof step.getId === 'function'
    && typeof step.getGroup === 'function'
    && typeof step.getMetadata === 'function'
    && typeof step.createContext === 'function'
    && typeof step.run === 'function';
}

function parseStartupOptions(args: string[]): StartupOptions {
  let configPath = 'nodus.config.json';
  let clearCache = false;
  let clearLogs = false;
  let scan = false;

  for (const arg of args) {
    if (arg === '--clear-cache') { clearCache = true; continue; }
    if (arg === '--clear-logs') { clearLogs = true; continue; }
    if (arg === '--scan') { scan = true; continue; }
    if (!arg.startsWith('--')) configPath = arg;
  }

  return { configPath, clearCache, clearLogs, scan };
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
