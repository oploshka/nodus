import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inspect } from 'node:util';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';

export class ConsoleLogger implements EngineLogger {
  public info(event: string, data?: unknown): void { this.print('info', event, data); }
  public warn(event: string, data?: unknown): void { this.print('warn', event, data); }
  public error(event: string, data?: unknown): void { this.print('error', event, data); }

  private print(level: 'info' | 'warn' | 'error', event: string, data?: unknown): void {
    const prefix = `[${level}] ${event}`;
    const details = formatConsoleData(event, data);
    const line = details ? `${prefix} ${details}` : prefix;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

/** Writes the complete diagnostic payload to one log file for the whole process run. */
export class FileLogger implements EngineLogger {
  public constructor(public readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  public info(event: string, data?: unknown): void { this.write('info', event, data); }
  public warn(event: string, data?: unknown): void { this.write('warn', event, data); }
  public error(event: string, data?: unknown): void { this.write('error', event, data); }

  private write(level: string, event: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const payload = data === undefined
      ? ''
      : `\n${inspect(data, { depth: null, maxArrayLength: null, maxStringLength: null, breakLength: 140, compact: false })}`;
    appendFileSync(this.path, `[${timestamp}] [${level}] ${event}${payload}\n`, 'utf8');
  }
}

export class CompositeLogger implements EngineLogger {
  public constructor(private readonly loggers: EngineLogger[]) {}
  public info(event: string, data?: unknown): void { for (const logger of this.loggers) logger.info(event, data); }
  public warn(event: string, data?: unknown): void { for (const logger of this.loggers) logger.warn(event, data); }
  public error(event: string, data?: unknown): void { for (const logger of this.loggers) logger.error(event, data); }
}

export class NullLogger implements EngineLogger {
  public info(): void {}
  public warn(): void {}
  public error(): void {}
}

function formatConsoleData(event: string, data: unknown): string {
  if (data === undefined) return '';

  // Model payloads are very large. Keep the console useful while FileLogger stores
  // the complete request/response exchange and metadata without truncation.
  if ((event === 'model.run' || event === 'model.run.error') && isRecord(data)) {
    const meta = isRecord(data.meta) ? data.meta : undefined;
    const pieces: string[] = [];
    if (typeof meta?.durationMs === 'number') pieces.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
    if (typeof meta?.totalTokens === 'number') pieces.push(`${meta.totalTokens} tok`);
    if ('data' in data) pieces.push(`data=${inspect(data.data, { depth: 4, maxArrayLength: 8, maxStringLength: 500, breakLength: 160, compact: true })}`);
    if (event === 'model.run.error' && isRecord(data.error) && typeof data.error.message === 'string') pieces.push(`error=${data.error.message}`);
    return pieces.join(' · ');
  }

  return inspect(data, {
    depth: 6,
    maxArrayLength: 12,
    maxStringLength: 800,
    breakLength: 180,
    compact: true,
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
