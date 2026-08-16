import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Bootstrap } from '@app/Bootstrap.js';
import { runCli } from '@app/Cli/Cli.js';
import { scanProject } from '@app/Cli/ScanProject.js';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import { CompositeLogger, ConsoleLogger, FileLogger } from '@app/Logging/Logger.js';
import { DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH } from '@engine/Project/File/ProjectFileIndexStore.js';
import { DEFAULT_RESEARCH_CACHE_PATH } from '@engine/Research/ResearchStore.js';
import type { ProjectConfiguration } from '@engine/Type/EngineConfiguration.js';

interface StartupOptions {
  configPath: string;
  clearCache: boolean;
  clearLogs: boolean;
  scan: boolean;
}

async function main(args: string[]): Promise<void> {
  const options = parseStartupOptions(args);
  const configuration = await ConfigurationLoader.load(options.configPath);
  const logDirectory = resolve(process.cwd(), 'log', 'runtime', configuration.project.id);

  if (options.clearLogs) await rm(logDirectory, { recursive: true, force: true });

  const logPath = resolve(logDirectory, `${fileTimestamp()}-nodus.log`);
  const logger = new CompositeLogger([new ConsoleLogger(configuration.language?.response), new FileLogger(logPath)]);
  logger.info('app.startup', {
    projectId: configuration.project.id,
    clearCache: options.clearCache,
    clearLogs: options.clearLogs,
    scan: options.scan,
    logPath,
  });

  if (options.clearCache) await clearProjectCache(configuration.project);

  const target = await Bootstrap.createTarget(configuration.project, logger);
  if (options.scan && configuration.project.scanMode !== 'on-open') await target.scan();

  const engine = await Bootstrap.createEngine(configuration, { logger, target });

  await runCli({
    engine,
    projectId: target.id,
    scanProject: () => scanProject(target.scan),
  });
  logger.info('app.exit');
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

async function clearProjectCache(configuration: ProjectConfiguration): Promise<void> {
  const paths = [
    configuration.indexCachePath ?? DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH,
    configuration.researchCachePath ?? DEFAULT_RESEARCH_CACHE_PATH,
  ];
  for (const path of paths) await rm(resolve(configuration.root, path), { force: true });
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
