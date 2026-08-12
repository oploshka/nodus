import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { AppConfiguration } from './Configuration.js';

export class ConfigurationLoader {
  public static async load(path: string): Promise<AppConfiguration> {
    const absolute = resolve(path);
    const parsed = JSON.parse(await readFile(absolute, 'utf8')) as Partial<AppConfiguration>;
    if (!parsed.project?.id || !parsed.project.root) throw new Error('Configuration requires project.id and project.root');
    if (!parsed.model?.endpoint || !parsed.model.model) throw new Error('Configuration requires model.endpoint and model.model');
    const base = dirname(absolute);

    return {
      project: {
        id: parsed.project.id,
        root: resolve(base, parsed.project.root),
        scanMode: parsed.project.scanMode ?? 'on-open',
        include: parsed.project.include ?? [],
        exclude: parsed.project.exclude ?? ['node_modules', 'dist', '.git', '.nodus'],
        indexCachePath: parsed.project.indexCachePath ?? '.nodus/project-index.json',
        researchCachePath: parsed.project.researchCachePath ?? '.nodus/research-cache.json',
      },
      model: {
        provider: 'openai-compatible',
        endpoint: parsed.model.endpoint,
        model: parsed.model.model,
        apiKey: parsed.model.apiKey,
        temperature: parsed.model.temperature ?? 0,
        maxTokens: parsed.model.maxTokens ?? 4096,
        requestTimeoutMs: parsed.model.requestTimeoutMs ?? 600_000,
        messageLayout: parsed.model.messageLayout ?? 'collapsed-user',
      },
      runtime: {
        maxWorkerIterations: parsed.runtime?.maxWorkerIterations ?? 8,
        maxResearchActions: parsed.runtime?.maxResearchActions ?? 3,
        maxEditActions: parsed.runtime?.maxEditActions ?? 2,
      },
    };
  }
}
