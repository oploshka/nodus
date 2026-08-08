import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import type { Project } from '@project/Project';

export class ProjectDiscovery {
  constructor(private readonly filesystem: FileSystemTool) {}

  async discover(path: string): Promise<Project> {
    const entries = await this.filesystem.list(path);

    return {
      path,
      name: path.split('/').pop() ?? path,
      files: entries
    };
  }
}