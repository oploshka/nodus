import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ProjectConfiguration } from '@engine/Type/EngineConfiguration.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ProjectIndex, ProjectFileFact } from '@engine/Project/ProjectIndex.js';
import { ProjectScanner } from '@engine/Project/ProjectScanner.js';

export class Project {
  private _index?: ProjectIndex;

  public readonly configuration: ProjectConfiguration;

  public constructor(
    configuration: ProjectConfiguration,
    private readonly logger: EngineLogger,
    private readonly scanner = new ProjectScanner(),
  ) {
    this.configuration = {
      ...configuration,
      scanMode: configuration.scanMode ?? 'on-open',
      include: configuration.include ?? [],
      exclude: configuration.exclude ?? ['node_modules', 'dist', '.git', '.nodus'],
      indexCachePath: configuration.indexCachePath ?? '.nodus/project-index.json',
      researchCachePath: configuration.researchCachePath ?? '.nodus/research-cache.json',
    };
  }

  public get id(): string { return this.configuration.id; }
  public get root(): string { return this.configuration.root; }
  public get index(): ProjectIndex | undefined { return this._index; }

  public async open(): Promise<void> {
    await this.loadIndex();
    if (this.configuration.scanMode === 'on-open') await this.scan();
  }

  public async scan(): Promise<ProjectIndex> {
    this._index = await this.scanner.scan(this.configuration);
    await this.saveIndex();
    this.logger.info('project.scan', { files: this._index.files.length });
    return this._index;
  }

  public async read(path: string): Promise<string> {
    return readFile(this.resolveProjectPath(path), 'utf8');
  }

  public async write(path: string, content: string): Promise<void> {
    const absolute = this.resolveProjectPath(path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  }

  public async hash(path: string): Promise<string> {
    const content = await readFile(this.resolveProjectPath(path));
    return createHash('sha256').update(content).digest('hex');
  }

  public candidateFiles(question: string, limit = 6): ProjectFileFact[] {
    const files = this._index?.files ?? [];
    const tokens = Array.from(new Set(question.toLowerCase().match(/[a-zа-яё0-9_$-]{3,}/gi) ?? []));
    const scored = files.map((file) => {
      const haystack = [file.path, ...file.imports, ...file.exports].join(' ').toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (file.path.toLowerCase().includes(token)) score += 5;
        if (haystack.includes(token)) score += 2;
      }
      if (/cli|command/.test(question.toLowerCase()) && /Cli/i.test(file.path)) score += 8;
      if (/conversation/.test(question.toLowerCase()) && /conversation/i.test(file.path)) score += 8;
      if (/index|project/.test(question.toLowerCase()) && /project|index/i.test(file.path)) score += 4;
      return { file, score };
    });
    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
      .slice(0, limit)
      .map((item) => item.file);
  }

  private resolveProjectPath(path: string): string {
    const absolute = isAbsolute(path) ? resolve(path) : resolve(this.root, path);
    const rel = relative(this.root, absolute).split(sep).join('/');
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`Path escapes project root: ${path}`);
    return absolute;
  }

  private async loadIndex(): Promise<void> {
    const cachePath = this.configuration.indexCachePath;
    if (!cachePath) return;
    try {
      const parsed = JSON.parse(await readFile(this.resolveProjectPath(cachePath), 'utf8')) as ProjectIndex;
      if (parsed.version === 1 && parsed.projectId === this.id) this._index = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('project.index.load.failed', String(error));
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this._index || !this.configuration.indexCachePath) return;
    const path = this.resolveProjectPath(this.configuration.indexCachePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(this._index, null, 2), 'utf8');
  }
}
