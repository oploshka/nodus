// Cli.ts

import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { ProjectScanner } from '@project/Scanner/ProjectScanner';

export class Cli {
  constructor(
    private readonly configuration = new ConfigurationLoader(),
    private readonly scanner = new ProjectScanner(),
  ) {}

  async run(): Promise<void> {
    const config = this.configuration.load();
    const project = await this.scanner.scan(
      config.projectRoot,
    );

    console.log(`Project: ${project.root}`);
    console.log(`Files: ${project.files.length}`);

    for (const file of project.files) {
      console.log(file);
    }
  }
}