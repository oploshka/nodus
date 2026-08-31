import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inspect } from 'node:util';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';

export class ConsoleLogger implements EngineLogger {
  private readonly russian: boolean;

  public constructor(responseLanguage = 'en') {
    this.russian = responseLanguage.toLowerCase().startsWith('ru');
  }

  public info(event: string, data?: unknown): void {
    console.log(this.format(event, data));
  }

  public warn(event: string, data?: unknown): void {
    console.warn(this.format(event, data));
  }

  public error(event: string, data?: unknown): void {
    console.error(this.format(event, data));
  }

  private format(event: string, data?: unknown): string {
    if (event === 'app.startup' && isRecord(data)) {
      const project = typeof data.projectId === 'string' ? data.projectId : '';
      const logPath = typeof data.logPath === 'string' ? data.logPath : '';
      return this.russian
        ? `[App] Проект: ${project}${logPath ? `\n  Лог: ${logPath}` : ''}`
        : `[App] Project: ${project}${logPath ? `\n  Log: ${logPath}` : ''}`;
    }

    if (event === 'app.exit') return this.russian ? '[App] Завершено.' : '[App] Exited.';
    if (event === 'project.scan' && isRecord(data) && typeof data.files === 'number') {
      return this.russian
        ? `[Project] Проиндексировано файлов: ${data.files}`
        : `[Project] Indexed files: ${data.files}`;
    }

    return data === undefined
      ? `[${event}]`
      : `[${event}] ${inspect(data, { depth: 5, colors: Boolean(process.stdout.isTTY), compact: true })}`;
  }
}

export class FileLogger implements EngineLogger {
  public constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  public info(event: string, data?: unknown): void { this.write('info', event, data); }
  public warn(event: string, data?: unknown): void { this.write('warn', event, data); }
  public error(event: string, data?: unknown): void { this.write('error', event, data); }

  private write(level: string, event: string, data?: unknown): void {
    appendFileSync(this.path, `${JSON.stringify({
      at: new Date().toISOString(),
      level,
      event,
      data: serialize(data),
    })}\n`, 'utf8');
  }
}

export class CompositeLogger implements EngineLogger {
  public constructor(private readonly loggers: readonly EngineLogger[]) {}

  public info(event: string, data?: unknown): void {
    for (const logger of this.loggers) logger.info(event, data);
  }

  public warn(event: string, data?: unknown): void {
    for (const logger of this.loggers) logger.warn(event, data);
  }

  public error(event: string, data?: unknown): void {
    for (const logger of this.loggers) logger.error(event, data);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
