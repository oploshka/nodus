import { runCli } from './cli/Cli.js';

const configPath = process.argv[2] ?? 'nodus.config.json';
runCli(configPath).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
