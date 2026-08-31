import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { ResearchAnswer} from "@engine/Process/Research/ResearchTypes.js";

export const DEFAULT_RESEARCH_CACHE_PATH = '.nodus/research-cache.json';

interface StoreFile {
  version: 1;
  entries: ResearchAnswer[];
}

export class ResearchStore {
  private readonly entries = new Map<string, ResearchAnswer>();

  public constructor(
    private readonly fileSystem: FileSystem,
    private readonly logger: EngineLogger,
    private readonly cachePath = DEFAULT_RESEARCH_CACHE_PATH,
  ) {}

  public async open(): Promise<void> {
    if (!this.cachePath) return;
    try {
      const raw = await this.fileSystem.read(this.cachePath);
      const parsed = JSON.parse(raw) as StoreFile;
      if (parsed.version !== 1) return;
      for (const entry of parsed.entries) this.entries.set(this.key(entry.question), entry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('research.cache.load.failed', String(error));
    }
  }

  public async get(question: string): Promise<ResearchAnswer | undefined> {
    const entry = this.entries.get(this.key(question));
    if (!entry) return undefined;
    for (const source of entry.sources) {
      try {
        if (await this.fileSystem.hash(source.path) !== source.hash) {
          this.entries.delete(this.key(question));
          this.logger.info('research.cache.stale', { question, source: source.path });
          return undefined;
        }
      } catch {
        this.entries.delete(this.key(question));
        return undefined;
      }
    }
    return this.clone(entry);
  }

  public async put(answer: ResearchAnswer): Promise<void> {
    this.entries.set(this.key(answer.question), this.clone(answer));
    await this.persist();
  }

  public all(): ResearchAnswer[] { return [...this.entries.values()].map((entry) => this.clone(entry)); }

  private key(question: string): string { return question.trim().toLowerCase().replace(/\s+/g, ' '); }

  private clone(entry: ResearchAnswer): ResearchAnswer {
    return { ...entry, sources: entry.sources.map((source) => ({ ...source })) };
  }

  private async persist(): Promise<void> {
    if (!this.cachePath) return;
    const content = JSON.stringify({ version: 1, entries: this.all() } satisfies StoreFile, null, 2);
    await this.fileSystem.write(this.cachePath, content);
  }
}
