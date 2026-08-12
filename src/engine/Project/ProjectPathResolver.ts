import { access, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import type { ProjectIndex } from '@engine/Project/ProjectIndex.js';

/**
 * Converts untrusted/model-provided file references into canonical project paths.
 * Public results are always project-root-relative and use `/` separators.
 * Existing paths are also checked after realpath so symlinks cannot escape the project.
 */
export class ProjectPathResolver {
  private readonly realRoot: Promise<string>;

  public constructor(private readonly root: string) {
    this.realRoot = realpath(resolve(root));
  }

  /** Resolve a path that must already exist as a file inside the project. */
  public async resolveExisting(path: string, index?: ProjectIndex): Promise<string> {
    const requested = await this.toProjectPath(path);
    const direct = await this.existingFile(requested);
    if (direct) return direct;

    const repaired = await this.repairFromIndex(requested, index);
    if (repaired) return repaired;

    throw new Error(`Project file not found: ${path}`);
  }

  /**
   * Resolve a write/create target. The file may not exist yet, but its nearest
   * existing parent must stay inside the real project root.
   */
  public async resolveTarget(path: string): Promise<string> {
    const requested = await this.toProjectPath(path);
    const existing = await this.existingFile(requested);
    if (existing) return existing;

    await this.assertTargetParentInsideProject(requested);
    return requested;
  }

  /** Backward-compatible alias for read/edit callers. */
  public async resolve(path: string, index?: ProjectIndex): Promise<string> {
    return this.resolveExisting(path, index);
  }

  /** Normalize an already project-relative path without touching the filesystem. */
  public normalize(path: string): string {
    const value = this.stripDecorators(path).replace(/\\/g, '/');
    if (!value) throw new Error('Project path cannot be empty.');
    if (isAbsolute(value) || /^[A-Za-z]:\//.test(value) || value.startsWith('/')) {
      throw new Error(`Project path must be relative to project root: ${path}`);
    }

    const normalized = posix.normalize(value).replace(/^\.\//, '');
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`Path escapes project root: ${path}`);
    }

    const absolute = resolve(this.root, ...normalized.split('/'));
    const rel = relative(this.root, absolute).split(sep).join('/');
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`Path escapes project root: ${path}`);
    return rel;
  }

  private async toProjectPath(input: string): Promise<string> {
    const value = this.stripDecorators(input);
    if (!value) throw new Error('Project path cannot be empty.');

    let absoluteInput: string | undefined;
    if (/^file:/i.test(value)) {
      try {
        absoluteInput = fileURLToPath(value);
      } catch {
        throw new Error(`Invalid project file URL: ${input}`);
      }
    } else if (isAbsolute(value)) {
      absoluteInput = value;
    } else if (/^[A-Za-z]:[\\/]/.test(value)) {
      // On Windows this is handled by isAbsolute(). On other platforms it is
      // still an absolute foreign path and must never be treated as relative.
      throw new Error(`Absolute path is outside the current project platform: ${input}`);
    }

    if (absoluteInput) {
      return this.relativeFromAbsolute(absoluteInput, input);
    }

    return this.normalize(value);
  }

  private stripDecorators(input: string): string {
    let value = input.trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '`' && last === '`') || (first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1).trim();
      }
    }
    return value;
  }

  private async relativeFromAbsolute(absoluteInput: string, original: string): Promise<string> {
    const rootAbsolute = resolve(this.root);
    const targetAbsolute = resolve(absoluteInput);
    const rel = relative(rootAbsolute, targetAbsolute);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Path is outside project root: ${original}`);
    }
    return this.normalize(rel || '.');
  }

  private async repairFromIndex(requested: string, index?: ProjectIndex): Promise<string | undefined> {
    const indexedPaths = (index?.files ?? []).map((file) => this.normalize(file.path));

    const exact = await this.uniqueExisting(indexedPaths.filter((candidate) => candidate === requested));
    if (exact) return exact;

    const suffix = await this.uniqueExisting(indexedPaths.filter((candidate) =>
      requested.endsWith(`/${candidate}`) || candidate.endsWith(`/${requested}`),
    ));
    if (suffix) return suffix;

    const requestedName = basename(requested);
    const basenameMatches = indexedPaths.filter((candidate) => basename(candidate) === requestedName);
    const existingBasenameMatches = await this.existingFiles(basenameMatches);
    if (existingBasenameMatches.length === 1) return existingBasenameMatches[0];
    if (existingBasenameMatches.length > 1) {
      throw new Error(`Ambiguous project path: ${requestedName}. Multiple indexed files match the model path.`);
    }

    return undefined;
  }

  private async uniqueExisting(paths: string[]): Promise<string | undefined> {
    const existing = await this.existingFiles(paths);
    return existing.length === 1 ? existing[0] : undefined;
  }

  private async existingFiles(paths: string[]): Promise<string[]> {
    const unique = [...new Set(paths)];
    const result: string[] = [];
    for (const path of unique) {
      const existing = await this.existingFile(path);
      if (existing) result.push(existing);
    }
    return result;
  }

  private async existingFile(path: string): Promise<string | undefined> {
    const absolute = resolve(this.root, ...path.split('/'));
    try {
      const info = await stat(absolute);
      if (!info.isFile()) return undefined;
      await this.assertRealPathInsideProject(absolute, path);
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private async assertRealPathInsideProject(absolute: string, original: string): Promise<void> {
    const [rootReal, targetReal] = await Promise.all([this.realRoot, realpath(absolute)]);
    const rel = relative(rootReal, targetReal);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Path resolves outside project root: ${original}`);
    }
  }

  private async assertTargetParentInsideProject(path: string): Promise<void> {
    const rootReal = await this.realRoot;
    let current = dirname(resolve(this.root, ...path.split('/')));

    while (true) {
      try {
        await access(current);
        const parentReal = await realpath(current);
        const rel = relative(rootReal, parentReal);
        if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
          throw new Error(`Target path resolves outside project root: ${path}`);
        }
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const parent = dirname(current);
        if (parent === current) throw new Error(`No existing parent found for project target: ${path}`);
        current = parent;
      }
    }
  }
}
