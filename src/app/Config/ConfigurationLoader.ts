import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { AppConfiguration } from '@app/Config/Configuration.js';

/**
 * Reads and minimally validates external configuration.
 *
 * It deliberately does not invent runtime defaults. Defaults are owned by the
 * component that understands their semantics (Project, Worker, Model, etc.).
 */
export class ConfigurationLoader {
  public static async load(path: string): Promise<AppConfiguration> {
    const absolute = resolve(path);
    const parsed = JSON.parse(await readFile(absolute, 'utf8')) as Partial<AppConfiguration>;

    if (!parsed.project?.id || !parsed.project.root) {
      throw new Error('Configuration requires project.id and project.root');
    }
    if (!parsed.model?.provider || !parsed.model.endpoint || !parsed.model.model) {
      throw new Error('Configuration requires model.provider, model.endpoint and model.model');
    }

    const base = dirname(absolute);
    return {
      project: {
        ...parsed.project,
        id: parsed.project.id,
        root: resolve(base, parsed.project.root),
      },
      model: {
        ...parsed.model,
        provider: parsed.model.provider,
        endpoint: parsed.model.endpoint,
        model: parsed.model.model,
      },
      ...(parsed.runtime ? { runtime: { ...parsed.runtime } } : {}),
    };
  }
}
