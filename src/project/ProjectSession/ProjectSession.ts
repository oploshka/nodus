// ProjectSession.ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { ProjectConfiguration } from '@core/Configuration/Configuration';
import type { Logger } from '@core/Logging/Logger';
import type { KnowledgeStore } from '@knowledge/Store/KnowledgeStore';
import type { ProjectIndex } from '@project/Index/ProjectIndex';
import type { ProjectScanner } from '@project/Scanner/ProjectScanner';
import type { ProjectSnapshot } from '@project/Snapshot/ProjectSnapshot';

export class ProjectSession {
  public currentIndexMy?: ProjectIndex;

  public constructor(
    public readonly configuration: ProjectConfiguration,
    public readonly knowledge: KnowledgeStore,
    private readonly scanner: ProjectScanner,
    private readonly logger: Logger,
  ) {}

  public get projectId(): string {
    return this.configuration.id;
  }

  public get root(): string {
    return this.configuration.root;
  }

  public async open(): Promise<void> {
    await this.knowledge.load(this.resolveOptionalPath(this.configuration.knowledgePath));
    if (this.configuration.clearCacheOnStart) await this.clearCache();
    await this.loadSnapshot();

    await this.logger.info('project-opened', {
      root: this.root,
      hasIndex: Boolean(this.currentIndexMy),
      knowledgeEntries: this.knowledge.all().length,
      scanMode: this.configuration.scanMode,
    }, { projectId: this.projectId });

    if (this.configuration.scanMode === 'on-open') {
      await this.scan();
    }
  }


  public async clearCache(): Promise<void> {
    this.currentIndexMy = undefined;
    const cachePath = this.resolveOptionalPath(this.configuration.cachePath);
    if (!cachePath) return;
    await rm(cachePath, { force: true });
    await this.logger.info('project-cache-cleared', { path: cachePath }, { projectId: this.projectId });
  }

  public async scan(): Promise<ProjectIndex> {
    await this.logger.info('project-scan-started', undefined, { projectId: this.projectId });
    this.currentIndexMy = await this.scanner.scan(this.configuration);
    await this.saveSnapshot();
    await this.logger.info('project-scan-completed', { files: this.currentIndexMy.files.length }, { projectId: this.projectId });
    return this.currentIndexMy;
  }

  public async refresh(): Promise<ProjectIndex> {
    return this.scan();
  }

  public async saveSnapshot(): Promise<void> {
    const cachePath = this.resolveOptionalPath(this.configuration.cachePath);
    if (!cachePath) {
      return;
    }

    const snapshot: ProjectSnapshot = {
      schemaVersion: 1,
      projectId: this.projectId,
      root: this.root,
      savedAt: new Date().toISOString(),
      index: this.currentIndexMy,
    };

    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  private async loadSnapshot(): Promise<void> {
    const cachePath = this.resolveOptionalPath(this.configuration.cachePath);
    if (!cachePath) {
      return;
    }

    try {
      const raw = await readFile(cachePath, 'utf8');
      const snapshot = JSON.parse(raw) as ProjectSnapshot;
      if (snapshot.schemaVersion === 1 && snapshot.projectId === this.projectId) {
        this.currentIndexMy = snapshot.index;
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        await this.logger.warn('project-snapshot-load-failed', { error: String(error) }, { projectId: this.projectId });
      }
    }
  }

  private resolveOptionalPath(path?: string): string | undefined {
    if (!path) {
      return undefined;
    }
    return isAbsolute(path) ? path : resolve(this.root, path);
  }
}
