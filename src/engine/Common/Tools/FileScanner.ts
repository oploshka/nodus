import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import type { ProjectConfiguration } from '@engine/Type/EngineConfiguration.js';
import type { ProjectFileInfo, ProjectFileIndex } from '@engine/Project/File/ProjectFileIndex.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue']);
const DEFAULT_EXCLUDE = ['node_modules', 'dist', '.git', '.nodus'] as const;

/** Filesystem utility that builds the structural project-file index. */
export class FileScanner {
  public shouldScanOnOpen(mode: ProjectConfiguration['scanMode']): boolean {
    return (mode ?? 'on-open') === 'on-open';
  }

  public async scan(configuration: ProjectConfiguration): Promise<ProjectFileIndex> {
    const files: ProjectFileInfo[] = [];
    const resolved: ProjectConfiguration = {
      ...configuration,
      include: configuration.include ?? [],
      exclude: configuration.exclude ?? [...DEFAULT_EXCLUDE],
    };
    await this.walk(resolved.root, resolved.root, resolved, files);
    return { version: 1, projectId: resolved.id, root: resolved.root, scannedAt: new Date().toISOString(), files };
  }

  private async walk(root: string, directory: string, configuration: ProjectConfiguration, output: ProjectFileInfo[]): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const projectPath = this.normalize(relative(root, absolutePath));
      if (this.isExcluded(projectPath, configuration.exclude ?? [])) continue;
      if (entry.isDirectory()) {
        await this.walk(root, absolutePath, configuration, output);
        continue;
      }
      if (!entry.isFile() || !this.isIncluded(projectPath, configuration.include ?? [])) continue;
      const fileStat = await stat(absolutePath);
      const extension = extname(entry.name).toLowerCase();
      let imports: string[] = [];
      let exports: string[] = [];
      if (SOURCE_EXTENSIONS.has(extension) && fileStat.size <= 1024 * 1024) {
        const content = await readFile(absolutePath, 'utf8');
        imports = this.extractImports(content);
        exports = this.extractExports(content);
      }
      output.push({ path: projectPath, extension, size: fileStat.size, modifiedAt: fileStat.mtime.toISOString(), imports, exports });
    }
  }

  private extractImports(content: string): string[] {
    const values = new Set<string>();
    const patterns = [
      /(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]/g,
      /require\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
      /import\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
    ];
    for (const pattern of patterns) for (const match of content.matchAll(pattern)) if (match[1]) values.add(match[1]);
    return [...values];
  }

  private extractExports(content: string): string[] {
    const values = new Set<string>();
    const patterns = [
      /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z0-9_$]+)/g,
      /export\s*\{([^}]+)\}/g,
    ];
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        if (!match[1]) continue;
        for (const value of match[1].split(',')) {
          const normalized = value.trim().split(/\s+as\s+/)[0];
          if (normalized) values.add(normalized);
        }
      }
    }
    return [...values];
  }

  private isExcluded(path: string, exclude: string[]): boolean {
    return exclude.some((item) => {
      const normalized = this.normalize(item).replace(/\/$/, '');
      return path === normalized || path.startsWith(`${normalized}/`) || path.split('/').includes(normalized);
    });
  }

  private isIncluded(path: string, include: string[]): boolean {
    if (include.length === 0) return true;
    return include.some((item) => {
      const normalized = this.normalize(item).replace(/\/$/, '');
      return path === normalized || path.startsWith(`${normalized}/`);
    });
  }

  private normalize(path: string): string { return path.split(sep).join('/'); }
}
