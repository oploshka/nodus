import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { PathResolver } from '@engine/Common/Tools/PathResolver.js';
import type { ProjectFileIndex } from './ProjectFileIndex.js';

export const DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH = '.nodus/project-index.json';

/** Persistence lifecycle for ProjectFileIndex. */
export class ProjectFileIndexStore {
  private readonly pathResolver: PathResolver;

  public constructor(
    private readonly root: string,
    private readonly projectId: string,
    private readonly logger: EngineLogger,
    private readonly cachePath = DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH,
  ) {
    this.pathResolver = new PathResolver(root);
  }

  public async load(): Promise<ProjectFileIndex | undefined> {
    if (!this.cachePath) return undefined;
    try {
      const parsed = JSON.parse(await readFile(this.absolute(this.cachePath), 'utf8')) as ProjectFileIndex;
      return parsed.version === 1 && parsed.projectId === this.projectId ? parsed : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('project.index.load.failed', String(error));
      return undefined;
    }
  }

  public async save(index: ProjectFileIndex): Promise<void> {
    if (!this.cachePath) return;
    const path = this.absolute(this.cachePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(index, null, 2), 'utf8');
  }

  public async clear(): Promise<void> {
    if (!this.cachePath) return;
    await rm(this.absolute(this.cachePath), { force: true });
  }

  private absolute(path: string): string {
    const projectPath = this.pathResolver.normalize(path);
    return resolve(this.root, ...projectPath.split('/'));
  }
}
