import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ProjectFileIndex } from '@engine/Project/File/ProjectFileIndex.js';
import { PathResolver } from './PathResolver.js';

const DEFAULT_EXCLUDE = ['node_modules', 'dist', '.git', '.nodus'] as const;

/** Physical file access for one target root. Index lookup is injected only for path repair. */
export class FileSystem {
  public constructor(
    public readonly root: string,
    private readonly pathResolver: PathResolver,
    private readonly indexProvider: () => ProjectFileIndex | undefined,
    private readonly logger: EngineLogger,
    private readonly exclude: ReadonlyArray<string> = DEFAULT_EXCLUDE,
  ) {}

  public async resolvePath(path: string): Promise<string> {
    const resolved = await this.pathResolver.resolveExisting(path, this.indexProvider());
    this.logPathCorrection(path, resolved);
    return resolved;
  }

  public async resolveTargetPath(path: string): Promise<string> {
    const writeExclude = this.exclude.filter((item) => normalizeRule(item) !== '.nodus');
    const resolved = await this.pathResolver.resolveTarget(path, [...writeExclude]);
    this.logPathCorrection(path, resolved);
    return resolved;
  }

  public async read(path: string): Promise<string> {
    const projectPath = await this.resolvePath(path);
    return readFile(this.absolute(projectPath), 'utf8');
  }

  public async write(path: string, content: string): Promise<void> {
    const projectPath = await this.resolveTargetPath(path);
    const absolute = this.absolute(projectPath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  }

  public async hash(path: string): Promise<string> {
    const projectPath = await this.resolvePath(path);
    const content = await readFile(this.absolute(projectPath));
    return createHash('sha256').update(content).digest('hex');
  }

  private absolute(path: string): string {
    const projectPath = this.pathResolver.normalize(path);
    return resolve(this.root, ...projectPath.split('/'));
  }

  private logPathCorrection(requested: string, resolved: string): void {
    let canonicalRequested: string | undefined;
    try { canonicalRequested = this.pathResolver.normalize(requested); } catch { /* absolute/model path */ }
    if (canonicalRequested !== resolved) this.logger.info('project.path.corrected', { requested, resolved });
  }
}

function normalizeRule(rule: string): string {
  return rule.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}
