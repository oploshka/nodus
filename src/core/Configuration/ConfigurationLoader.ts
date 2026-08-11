// ConfigurationLoader.ts
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { NodusConfiguration } from '@core/Configuration/Configuration';

export class ConfigurationLoader {
  public static async load(path: string): Promise<NodusConfiguration> {
    const absolutePath = resolve(path);
    const raw = await readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<NodusConfiguration>;
    const configurationDirectory = dirname(absolutePath);

    if (!parsed.project?.id || !parsed.project.root) {
      throw new Error('Configuration requires project.id and project.root');
    }

    if (!parsed.model?.provider || !parsed.model.model) {
      throw new Error('Configuration requires model.provider and model.model');
    }

    return {
      project: {
        id: parsed.project.id,
        root: resolve(configurationDirectory, parsed.project.root),
        scanMode: parsed.project.scanMode ?? 'manual',
        cachePath: parsed.project.cachePath,
        clearCacheOnStart: parsed.project.clearCacheOnStart ?? false,
        knowledgePath: parsed.project.knowledgePath,
        include: parsed.project.include ?? [],
        exclude: parsed.project.exclude ?? ['node_modules', 'dist', '.git', '.nodus'],
      },
      model: {
        provider: parsed.model.provider,
        endpoint: parsed.model.endpoint,
        model: parsed.model.model,
        apiKey: parsed.model.apiKey,
        temperature: parsed.model.temperature ?? 0.2,
        maxTokens: parsed.model.maxTokens ?? 4096,
        messageLayout: parsed.model.messageLayout ?? 'collapsed-user',
        requestTimeoutMs: parsed.model.requestTimeoutMs ?? 600_000,
      },
      agent: {
        maxSteps: parsed.agent?.maxSteps ?? 20,
        responseLanguage: parsed.agent?.responseLanguage ?? 'auto',
        internalLanguage: parsed.agent?.internalLanguage ?? 'original',
      },
      knowledge: {
        generationMode: parsed.knowledge?.generationMode ?? 'disabled',
      },
      logging: {
        level: parsed.logging?.level ?? 'info',
        console: parsed.logging?.console ?? true,
        file: parsed.logging?.file ?? false,
        path: parsed.logging?.path ?? '.nodus/log/nodus.log',
        modelPayload: parsed.logging?.modelPayload ?? false,
        payloadPath: parsed.logging?.payloadPath ?? '.nodus/log/executions',
        executionPath: parsed.logging?.executionPath ?? '.nodus/log/executions',
        consoleMode: parsed.logging?.consoleMode ?? 'normal',
        colors: parsed.logging?.colors ?? true,
        clearOnStart: parsed.logging?.clearOnStart ?? false,
      },
    };
  }
}
