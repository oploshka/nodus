import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { sProcessSchema } from './ProcessSchema.js';

export interface sAutomationPackageSource {
  prompts?: Record<string, string>;
  schemas?: Record<string, sProcessSchema>;
  planners?: Record<string, unknown>;
  workers?: Record<string, unknown>;
  responses?: Record<string, unknown>;
  policies?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface sAutomationPackage {
  root: string;
  prompts: Readonly<Record<string, string>>;
  schemas: Readonly<Record<string, sProcessSchema>>;
  planners: Readonly<Record<string, unknown>>;
  workers: Readonly<Record<string, unknown>>;
  responses: Readonly<Record<string, unknown>>;
  policies: Readonly<Record<string, unknown>>;
  context: Readonly<Record<string, unknown>>;
}

/** Loads versioned user automation definitions independently from .nodus runtime data. */
export class AutomationLoader {
  public static async load(root: string): Promise<sAutomationPackage> {
    const absoluteRoot = resolve(root);
    const indexPath = resolve(absoluteRoot, 'index.js');
    const module = await import(pathToFileURL(indexPath).href) as { default?: unknown };
    const source = this.asPackageSource(module.default);
    const prompts = await this.loadPrompts(absoluteRoot, source.prompts ?? {});

    return {
      root: absoluteRoot,
      prompts,
      schemas: source.schemas ?? {},
      planners: source.planners ?? {},
      workers: source.workers ?? {},
      responses: source.responses ?? {},
      policies: source.policies ?? {},
      context: source.context ?? {},
    };
  }

  private static asPackageSource(value: unknown): sAutomationPackageSource {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('automation/index.js must default-export an object.');
    }
    return value as sAutomationPackageSource;
  }

  private static async loadPrompts(
    root: string,
    promptFiles: Readonly<Record<string, string>>,
  ): Promise<Record<string, string>> {
    const entries = await Promise.all(Object.entries(promptFiles).map(async ([id, relativePath]) => {
      const content = await readFile(resolve(root, relativePath), 'utf8');
      return [id, content] as const;
    }));
    return Object.fromEntries(entries);
  }
}
