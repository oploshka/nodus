import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Bootstrap } from '@app/Bootstrap.js';
import { runCli } from '@app/Cli/Cli.js';
import { scanProject } from '@app/Cli/ScanProject.js';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import { CompositeLogger, ConsoleLogger, FileLogger } from '@app/Logging/Logger.js';
import { DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH } from '@engine/Project/File/Index/ProjectFileIndex_Store.js';
import type { sTargetConfig } from '@engine/Type/EngineConfiguration.js';

interface StartupOptions {
  configPath: string;
  clearCache: boolean;
  clearLogs: boolean;
  scan: boolean;
}

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
    scan: options.scan,
    logPath,
  });

  if (options.clearCache) await clearTargetCache(configuration.target);

  const runtime = await Bootstrap.create(configuration, { logger });
  if (options.scan && configuration.target.scanMode !== 'on-open') await runtime.target.scan();

  await runCli({
    engine: runtime.engine,
    projectId: runtime.target.id,
    scanProject: () => scanProject(runtime.target.scan),
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

async function clearTargetCache(configuration: sTargetConfig): Promise<void> {
  const indexPath = configuration.indexCachePath ?? DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH;
  await rm(resolve(configuration.root, indexPath), { force: true });
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
