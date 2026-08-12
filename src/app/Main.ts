import { Bootstrap } from '@app/Bootstrap.js';
import { runCli } from '@app/Cli/Cli.js';
import { scanProject } from '@app/Cli/ScanProject.js';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import { ConsoleLogger } from '@app/Logging/Logger.js';
import { Project } from '@engine/Project/Project.js';

async function main(args: string[]): Promise<void> {
  const configPath = args[0] ?? 'nodus.config.json';
  const configuration = await ConfigurationLoader.load(configPath);
  const logger = new ConsoleLogger();

  // Main owns process input and app-level composition concerns. The same Project
  // instance is injected into Engine and the temporary /scan CLI command.
  const project = new Project(configuration.project, logger);
  await project.open();
  const engine = await Bootstrap.createEngine(configuration, { logger, project });

  await runCli({
    engine,
    projectId: project.id,
    scanProject: () => scanProject(project),
  });
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
