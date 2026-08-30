import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface sAutomationPackageSource {
  planners?: Record<string, unknown>;
  qualifiers?: Record<string, unknown>;
  determine?: Record<string, unknown>;
  research?: Record<string, unknown>;
  workers?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  policies?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface sAutomationPackage {
  root: string;
  planners: Readonly<Record<string, unknown>>;
  qualifiers: Readonly<Record<string, unknown>>;
  determine: Readonly<Record<string, unknown>>;
  research: Readonly<Record<string, unknown>>;
  workers: Readonly<Record<string, unknown>>;
  actions: Readonly<Record<string, unknown>>;
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

    const [planners, qualifiers, determine, research, workers, actions, policies, context] = await Promise.all([
      this.hydrateDefinitions(source.planners ?? {}),
      this.hydrateDefinitions(source.qualifiers ?? {}),
      this.hydrateDefinitions(source.determine ?? {}),
      this.hydrateDefinitions(source.research ?? {}),
      this.hydrateDefinitions(source.workers ?? {}),
      this.hydrateDefinitions(source.actions ?? {}),
      this.hydrateDefinitions(source.policies ?? {}),
      this.hydrateDefinitions(source.context ?? {}),
    ]);

    return {
      root: absoluteRoot,
      planners,
      qualifiers,
      determine,
      research,
      workers,
      actions,
      policies,
      context,
    };
  }

  private static asPackageSource(value: unknown): sAutomationPackageSource {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('automation/index.js must default-export an object.');
    }
    return value as sAutomationPackageSource;
  }

  private static async hydrateDefinitions(
    definitions: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const entries = await Promise.all(Object.entries(definitions).map(async ([id, definition]) => [
      id,
      await this.hydrateValue(definition),
    ] as const));

    return Object.fromEntries(entries);
  }

  private static async hydrateValue(value: unknown, key?: string): Promise<unknown> {
    if (key === 'prompt' && value instanceof URL) {
      if (value.protocol !== 'file:') throw new Error(`Automation prompt must be a file URL: ${value.href}`);
      return readFile(value, 'utf8');
    }

    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.hydrateValue(item)));
    }

    if (typeof value !== 'object' || value === null || value instanceof URL) return value;

    const entries = await Promise.all(Object.entries(value).map(async ([entryKey, entryValue]) => [
      entryKey,
      await this.hydrateValue(entryValue, entryKey),
    ] as const));

    return Object.fromEntries(entries);
  }
}
