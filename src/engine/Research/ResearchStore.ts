import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import type { ResearchAnswer, ResearchRequest } from '@engine/Research/ResearchTypes.js';

interface StoreFile {
  version: 1;
  entries: ResearchAnswer[];
}

export class ResearchStore {
  private readonly entries = new Map<string, ResearchAnswer>();

  public constructor(
    private readonly project: Project,
    private readonly logger: EngineLogger,
    private readonly cachePath?: string,
  ) {}

  public async open(): Promise<void> {
    if (!this.cachePath) return;
    try {
      const raw = await this.project.read(this.cachePath);
      const parsed = JSON.parse(raw) as StoreFile;
      if (parsed.version !== 1) return;
      for (const entry of parsed.entries) this.entries.set(this.key({ question: entry.question, targets: entry.targets }), entry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('research.cache.load.failed', String(error));
    }
  }

  public async get(request: ResearchRequest): Promise<ResearchAnswer | undefined> {
    const entry = this.entries.get(this.key(request));
    if (!entry) return undefined;
    for (const source of entry.sources) {
      try {
        if (await this.project.hash(source.path) !== source.hash) {
          this.entries.delete(this.key(request));
          this.logger.info('research.cache.stale', { request, source: source.path });
          return undefined;
        }
      } catch {
        this.entries.delete(this.key(request));
        return undefined;
      }
    }
    return this.clone(entry);
  }

  public async put(answer: ResearchAnswer): Promise<void> {
    this.entries.set(this.key({ question: answer.question, targets: answer.targets }), this.clone(answer));
    await this.persist();
  }

  public all(): ResearchAnswer[] { return [...this.entries.values()].map((entry) => this.clone(entry)); }

  private key(request: ResearchRequest): string {
    const question = request.question.trim().toLowerCase().replace(/\s+/g, ' ');
    const targets = (request.targets ?? []).map((target) => `${target.type}:${target.path.replace(/\\/g, '/').toLowerCase()}`).sort().join('|');
    return `${question}::${targets}`;
  }

  private clone(entry: ResearchAnswer): ResearchAnswer {
    return { ...entry, sources: entry.sources.map((source) => ({ ...source })) };
  }

  private async persist(): Promise<void> {
    if (!this.cachePath) return;
    // Project.write creates the parent directory. mkdir is intentionally kept out of Project's public API.
    await this.project.write(this.cachePath, JSON.stringify({ version: 1, entries: this.all() } satisfies StoreFile, null, 2));
  }
}
