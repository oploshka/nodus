import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';

export interface TestLoggerOptions {
  directory?: string;
  zone?: string;
  now?: () => Date;
}

/**
 * One human-readable log file per scenario/test runtime.
 * Runtime components keep using the normal Logger interface; no separate Trace store exists.
 */
export class TestFileLogger implements EngineLogger {
  public readonly path: string;
  private readonly now: () => Date;

  public constructor(label: string, options: TestLoggerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    const directory = options.directory ?? join(process.cwd(), 'log', options.zone ?? 'test');
    mkdirSync(directory, { recursive: true });
    const timestamp = this.fileTimestamp(this.now());
    this.path = join(directory, `${timestamp}_${this.safe(label)}.log`);
    this.write('info', 'test.log.open', { label });
  }

  public info(event: string, data?: unknown): void { this.write('info', event, data); }
  public warn(event: string, data?: unknown): void { this.write('warn', event, data); }
  public error(event: string, data?: unknown): void { this.write('error', event, data); }

  private write(level: 'info' | 'warn' | 'error', event: string, data?: unknown): void {
    const suffix = data === undefined ? '' : ` ${this.serialize(data)}`;
    appendFileSync(this.path, `[${this.now().toISOString()}] [${level.toUpperCase()}] ${event}${suffix}\n`, 'utf8');
  }

  private serialize(value: unknown): string {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); }
    catch { return String(value); }
  }

  private safe(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'test';
  }

  private fileTimestamp(value: Date): string {
    return value.toISOString().replace(/[:.]/g, '-');
  }
}
