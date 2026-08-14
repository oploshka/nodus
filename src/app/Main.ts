import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Bootstrap } from '@app/Bootstrap.js';
import { runCli } from '@app/Cli/Cli.js';
import { scanProject } from '@app/Cli/ScanProject.js';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import { CompositeLogger, ConsoleLogger, FileLogger } from '@app/Logging/Logger.js';
import { Project } from '@engine/Project/Project.js';

interface StartupOptions {
  configPath: string;
  clearCache: boolean;
  clearLogs: boolean;
  scan: boolean;
}

async function main(args: string[]): Promise<void> {
  const options = parseStartupOptions(args);
  const configuration = await ConfigurationLoader.load(options.configPath);
  const logDirectory = resolve(configuration.project.root, '.nodus/logs');

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

  // Main owns process input and app-level startup concerns. The same Project
  // instance is injected into Engine and the temporary /scan CLI command.
  const project = new Project(configuration.project, logger);
  if (options.clearCache) await clearProjectCache(project);

  await project.open();
  if (options.scan && configuration.project.scanMode !== 'on-open') await project.scan();

  const engine = await Bootstrap.createEngine(configuration, { logger, project });

  await runCli({
    engine,
    projectId: project.id,
    scanProject: () => scanProject(project),
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

async function clearProjectCache(project: Project): Promise<void> {
  const paths = [project.configuration.indexCachePath, project.configuration.researchCachePath];
  for (const path of paths) {
    if (!path) continue;
    await rm(resolve(project.root, path), { force: true });
  }
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
