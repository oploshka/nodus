import { resolve } from 'node:path';
import type { AppConfiguration } from '@app/Config/Configuration.js';
import { ConsoleLogger } from '@app/Logging/Logger.js';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';
import { Engine } from '@engine/Engine.js';
import type {
  sCoreGroupConfig,
  tCoreModuleDefinition,
} from '@engine/Core/CoreTsType.js';
import { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { PathResolver } from '@engine/Common/Tools/PathResolver.js';
import {
  ProjectFileIndex,
  type iProjectFileIndex,
  type sProjectFileIndexState,
} from '@engine/Project/File/Index/ProjectFileIndex.js';
import { ProjectFileIndex_Scanner } from '@engine/Project/File/Index/ProjectFileIndex_Scanner.js';
import { ProjectFileIndex_Store } from '@engine/Project/File/Index/ProjectFileIndex_Store.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { sTargetConfig } from '@engine/Type/EngineConfiguration.js';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';

/** App composition capability for one configured target. */
export interface iTargetRuntime {
  id: string;
  root: string;
  fileSystem: FileSystem;
  fileIndex: iProjectFileIndex;
  scan(): Promise<sProjectFileIndexState>;
  clearIndex(): Promise<void>;
}

export interface iAppRuntime {
  engine: Engine;
  target: iTargetRuntime;
  logger: EngineLogger;
  model: ModelRunner;
}

export interface BootstrapOverrides {
  logger?: EngineLogger;
  model?: ModelAdapter;
  target?: iTargetRuntime;
}

interface sAutomationRuntimePackage {
  start: string;
  groups: Readonly<Record<string, sCoreGroupConfig>>;
  modules: Readonly<Record<string, tCoreModuleDefinition>>;
}

/** Composition root for application infrastructure plus the configured Core runtime. */
export class Bootstrap {
  public static async create(
    configuration: AppConfiguration,
    overrides: BootstrapOverrides = {},
  ): Promise<iAppRuntime> {
    const logger = overrides.logger ?? new ConsoleLogger(configuration.language?.response);
    const adapter = overrides.model ?? new OpenAICompatibleModelAdapter(
      configuration.model.endpoint,
      configuration.model.apiKey,
      configuration.model.requestTimeoutMs,
    );
    const model = new ModelRunner(adapter, configuration.model);
    const target = overrides.target ?? await this.createTarget(configuration.target, logger);

    const automationRoot = configuration.automation?.root ?? 'automation';
    const automation = await AutomationLoader.load(resolve(automationRoot));
    const runtime = resolveAutomationRuntime(automation);
    const start = runtime.modules[runtime.start];
    if (!start) throw new Error(`Automation start module '${runtime.start}' is not registered.`);

    const engine = new Engine({
      start,
      groups: runtime.groups,
      modules: runtime.modules,
    });

    return { engine, target, logger, model };
  }

  public static async createTarget(configuration: sTargetConfig, logger: EngineLogger): Promise<iTargetRuntime> {
    const scanner = new ProjectFileIndex_Scanner();
    const indexStore = new ProjectFileIndex_Store(
      configuration.root,
      configuration.id,
      logger,
      configuration.indexCachePath,
    );
    const loadedState = await indexStore.load();
    const initialState: sProjectFileIndexState = loadedState ?? {
      version: 1,
      projectId: configuration.id,
      root: configuration.root,
      scannedAt: new Date(0).toISOString(),
      files: [],
    };
    const fileIndex = new ProjectFileIndex(initialState);
    const pathResolver = new PathResolver(configuration.root);
    const fileSystem = new FileSystem(
      configuration.root,
      pathResolver,
      () => fileIndex.snapshot(),
      logger,
      configuration.exclude,
    );

    const scan = async (): Promise<sProjectFileIndexState> => {
      const state = await scanner.scan(configuration);
      fileIndex.replace(state);
      await indexStore.save(state);
      logger.info('project.scan', { files: state.files.length });
      return state;
    };

    if (scanner.shouldScanOnOpen(configuration.scanMode)) await scan();

    return {
      id: configuration.id,
      root: configuration.root,
      fileSystem,
      fileIndex,
      scan,
      clearIndex: () => indexStore.clear(),
    };
  }
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
