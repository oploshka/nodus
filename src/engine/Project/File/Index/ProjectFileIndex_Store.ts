import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { PathResolver } from '@engine/Common/Tools/PathResolver.js';
import type { sProjectFileIndexState } from './ProjectFileIndex.js';

export const DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH = '.nodus/project-index.json';

/** Persistence lifecycle subcomponent of ProjectFileIndex. */
export class ProjectFileIndex_Store {
  private readonly pathResolver: PathResolver;

  public constructor(
    private readonly root: string,
    private readonly projectId: string,
    private readonly logger: EngineLogger,
    private readonly cachePath = DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH,
  ) {
    this.pathResolver = new PathResolver(root);
  }

  public async load(): Promise<sProjectFileIndexState | undefined> {
    if (!this.cachePath) return undefined;
    try {
      const parsed = JSON.parse(await readFile(this.absolute(this.cachePath), 'utf8')) as sProjectFileIndexState;
      return parsed.version === 1 && parsed.projectId === this.projectId ? parsed : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('project.index.load.failed', String(error));
      return undefined;
    }
  }

  public async save(index: sProjectFileIndexState): Promise<void> {
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
