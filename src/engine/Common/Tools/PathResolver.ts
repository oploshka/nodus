import { access, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import type { ProjectFileIndex } from '@engine/Project/File/ProjectFileIndex.js';

const ALWAYS_WRITE_BLOCKED = ['node_modules', '.git'] as const;

/** Converts untrusted file references into canonical paths inside one project root. */
export class PathResolver {
  public constructor(private readonly root: string) {}

  public async resolveExisting(path: string, index?: ProjectFileIndex): Promise<string> {
    const requested = await this.toProjectPath(path);
    const direct = await this.existingFile(requested);
    if (direct) return direct;
    const repaired = await this.repairFromIndex(requested, index);
    if (repaired) return repaired;
    throw new Error(`Project file not found: ${path}`);
  }

  public async resolveTarget(path: string, exclude: string[] = []): Promise<string> {
    const requested = await this.toProjectPath(path);
    this.assertWriteAllowed(requested, exclude);
    const existing = await this.existingFile(requested);
    if (existing) return existing;
    await this.assertTargetParentExists(requested);
    return requested;
  }

  public async resolve(path: string, index?: ProjectFileIndex): Promise<string> { return this.resolveExisting(path, index); }

  public normalize(path: string): string {
    const value = this.stripDecorators(path).replace(/\\/g, '/');
    if (!value) throw new Error('Project path cannot be empty.');
    if (isAbsolute(value) || /^[A-Za-z]:\//.test(value) || value.startsWith('/')) throw new Error(`Project path must be relative to project root: ${path}`);
    const normalized = posix.normalize(value).replace(/^\.\//, '');
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new Error(`Path escapes project root: ${path}`);
    const absolute = resolve(this.root, ...normalized.split('/'));
    const rel = relative(this.root, absolute).split(sep).join('/');
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`Path escapes project root: ${path}`);
    return rel;
  }

  public assertWriteAllowed(path: string, exclude: string[] = []): void {
    const normalized = this.normalize(path);
    const blocked = [...ALWAYS_WRITE_BLOCKED, ...exclude].map((item) => this.normalizeRule(item)).filter(Boolean);
    const rule = blocked.find((item) => this.matchesRule(normalized, item));
    if (rule) throw new Error(`Project path is not writable by Nodus: ${normalized} (blocked by ${rule})`);
  }

  private async toProjectPath(input: string): Promise<string> {
    const value = this.stripDecorators(input);
    if (!value) throw new Error('Project path cannot be empty.');
    let absoluteInput: string | undefined;
    if (/^file:/i.test(value)) {
      try { absoluteInput = fileURLToPath(value); } catch { throw new Error(`Invalid project file URL: ${input}`); }
    } else if (isAbsolute(value)) absoluteInput = value;
    else if (/^[A-Za-z]:[\\/]/.test(value)) throw new Error(`Absolute path is outside the current project platform: ${input}`);
    if (absoluteInput) return this.relativeFromAbsolute(absoluteInput, input);
    return this.normalize(value);
  }

  private stripDecorators(input: string): string {
    let value = input.trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '`' && last === '`') || (first === '"' && last === '"') || (first === "'" && last === "'")) value = value.slice(1, -1).trim();
    }
    return value;
  }

  private async relativeFromAbsolute(absoluteInput: string, original: string): Promise<string> {
    const rootAbsolute = resolve(this.root);
    const targetAbsolute = resolve(absoluteInput);
    const rel = relative(rootAbsolute, targetAbsolute);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Path is outside project root: ${original}`);
    return this.normalize(rel || '.');
  }

  private async repairFromIndex(requested: string, index?: ProjectFileIndex): Promise<string | undefined> {
    const paths = (index?.files ?? []).map((file) => this.normalize(file.path));
    const exact = await this.uniqueExisting(paths.filter((candidate) => candidate === requested));
    if (exact) return exact;
    const suffix = await this.uniqueExisting(paths.filter((candidate) => requested.endsWith(`/${candidate}`) || candidate.endsWith(`/${requested}`)));
    if (suffix) return suffix;
    const requestedName = basename(requested);
    const existingMatches = await this.existingFiles(paths.filter((candidate) => basename(candidate) === requestedName));
    if (existingMatches.length === 1) return existingMatches[0];
    if (existingMatches.length > 1) throw new Error(`Ambiguous project path: ${requestedName}. Multiple indexed files match the model path.`);
    return undefined;
  }

  private async uniqueExisting(paths: string[]): Promise<string | undefined> {
    const existing = await this.existingFiles(paths);
    return existing.length === 1 ? existing[0] : undefined;
  }

  private async existingFiles(paths: string[]): Promise<string[]> {
    const result: string[] = [];
    for (const path of [...new Set(paths)]) {
      const existing = await this.existingFile(path);
      if (existing) result.push(existing);
    }
    return result;
  }

  private async existingFile(path: string): Promise<string | undefined> {
    const absolute = resolve(this.root, ...path.split('/'));
    try {
      const info = await stat(absolute);
      return info.isFile() ? path : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private async assertTargetParentExists(path: string): Promise<void> {
    let current = dirname(resolve(this.root, ...path.split('/')));
    const rootAbsolute = resolve(this.root);
    while (true) {
      const rel = relative(rootAbsolute, current);
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Target path is outside project root: ${path}`);
      try { await access(current); return; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const parent = dirname(current);
        if (parent === current) throw new Error(`No existing parent found for project target: ${path}`);
        current = parent;
      }
    }
  }

  private normalizeRule(rule: string): string {
    const value = rule.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (!value || value === '.') return '';
    return posix.normalize(value);
  }

  private matchesRule(path: string, rule: string): boolean {
    if (path === rule || path.startsWith(`${rule}/`)) return true;
    return !rule.includes('/') && path.split('/').includes(rule);
  }
}
