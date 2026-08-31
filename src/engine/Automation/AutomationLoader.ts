import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type sAutomationPackage = Readonly<Record<string, unknown>>;

/** Loads the versioned automation package: product group policy plus available modules. */
export class AutomationLoader {
  public static async load(root: string): Promise<sAutomationPackage> {
    const absoluteRoot = resolve(root);
    const indexPath = resolve(absoluteRoot, 'index.js');
    const module = await import(pathToFileURL(indexPath).href) as { default?: unknown };
    return this.hydrateDefinitions(this.asPackageSource(module.default));
  }

  private static asPackageSource(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('automation/index.js must default-export an object.');
    }
    return value as Record<string, unknown>;
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
