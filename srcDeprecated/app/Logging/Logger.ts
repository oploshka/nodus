import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Presentation, PresentationColor, PresentedMessage } from '@engine/Common/Presentation/Presentation.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';

const ANSI: Record<PresentationColor, string> = {
  gray: '\x1b[90m',
  white: '\x1b[1;37m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  magenta: '\x1b[35m',
  brightMagenta: '\x1b[95m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  red: '\x1b[31m',
};
const RESET = '\x1b[0m';

export class ConsoleLogger implements EngineLogger {
  private readonly russian: boolean;
  private readonly responseLanguage: string;
  private readonly colorsEnabled = Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env);
  private modelIndent = 4;

  public constructor(responseLanguage = 'en') {
    this.responseLanguage = responseLanguage;
    this.russian = responseLanguage.toLowerCase().startsWith('ru');
  }

  public info(event: string, data?: unknown): void { this.print('info', event, data); }
  public warn(event: string, data?: unknown): void { this.print('warn', event, data); }
  public error(event: string, data?: unknown): void { this.print('error', event, data); }

  private print(level: 'info' | 'warn' | 'error', event: string, data?: unknown): void {
    const text = this.format(event, data);
    if (!text) return;
    if (level === 'error') console.error(text);
    else if (level === 'warn') console.warn(text);
    else console.log(text);
  }

  private format(event: string, data: unknown): string {
    const record = isRecord(data) ? data : {};

    if (event === 'app.startup') {
      const project = stringValue(record.projectId);
      const logPath = stringValue(record.logPath);
      const app = this.label('App', 'gray');
      return this.russian
        ? `${app} Проект: ${project}${logPath ? `\n  Лог: ${logPath}` : ''}`
        : `${app} Project: ${project}${logPath ? `\n  Log: ${logPath}` : ''}`;
    }

    if (event === 'app.exit') return this.russian ? `${this.label('App', 'gray')} Завершено.` : `${this.label('App', 'gray')} Exited.`;

    if (event === 'project.scan') {
      const files = numberValue(record.files);
      return this.russian
        ? `${this.label('Project', 'cyan')} Проиндексировано файлов: ${files}`
        : `${this.label('Project', 'cyan')} Indexed files: ${files}`;
    }

    if (event.endsWith('model.run.start')) {
      this.modelIndent = event.startsWith('engine.edit.') ? 6 : 4;
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({ type: 'start' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, this.modelIndent) : '';
    }

    if (event.endsWith('model.run') || event.endsWith('model.run.error')) {
      const presentation = this.presentation(record.presentation);
      const meta = isRecord(record.meta) ? record.meta : undefined;
      const message = presentation.format({ type: 'finish', meta }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, this.modelIndent) : '';
    }

    if (event === 'engine.edit.prepare.start') {
      const presentation = this.presentation(record.presentation);
      const files = numberValue(record.files) || numberValue(record.edits);
      const message = presentation.format({ type: 'change-set-prepare', files }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'engine.edit.file.start') {
      this.modelIndent = 6;
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({ type: 'file-prepare', path: stringValue(record.path) }, this.responseLanguage);
      return message ? this.detail(message.text, 4) : '';
    }

    if (event === 'engine.edit.file.finish') {
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({
        type: 'file-prepared',
        path: stringValue(record.path),
        operations: numberValue(record.operations),
      }, this.responseLanguage);
      return message ? this.detail(message.text, 4, 'success') : '';
    }

    if (event === 'engine.edit.file.failed') {
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({
        type: 'file-failed',
        path: stringValue(record.path),
        reason: stringValue(record.reason),
      }, this.responseLanguage);
      return message ? this.detail(message.text, 4, 'failure') : '';
    }

    if (event === 'engine.edit.strategy.retry') {
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({
        type: 'strategy-retry',
        path: stringValue(record.path),
        strategy: stringValue(record.strategy),
        attempt: numberValue(record.editAttempt),
        max: numberValue(record.maxEditAttempts),
        reason: stringValue(record.error),
      }, this.responseLanguage);
      return message ? this.detail(message.text, 4, 'warning') : '';
    }

    if (event === 'engine.edit.strategy.recovered') {
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({
        type: 'strategy-recovered',
        path: stringValue(record.path),
        strategy: stringValue(record.strategy),
        attempt: numberValue(record.editAttempt),
      }, this.responseLanguage);
      return message ? this.detail(message.text, 4, 'success') : '';
    }

    if (event === 'engine.edit.strategy.fallback') {
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({
        type: 'strategy-fallback',
        path: stringValue(record.path),
        fromStrategy: stringValue(record.fromStrategy),
        toStrategy: stringValue(record.toStrategy),
        reason: stringValue(record.reason),
      }, this.responseLanguage);
      return message ? this.detail(message.text, 4, 'warning') : '';
    }

    if (event === 'engine.edit.commit.start' || event === 'engine.edit.commit.finish') {
      const presentation = this.presentation(record.presentation);
      const message = presentation.format({
        type: event.endsWith('.start') ? 'commit-start' : 'commit-finish',
        files: numberValue(record.files),
      }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    return '';
  }

  private presentation(value: unknown): Presentation<unknown> {
    if (!value || typeof value !== 'object') throw new Error('Console event is missing a valid presentation');
    const candidate = value as Partial<Presentation<unknown>>;
    if (typeof candidate.role !== 'string' || typeof candidate.color !== 'string' || typeof candidate.format !== 'function') {
      throw new Error('Console event contains an invalid presentation');
    }
    return candidate as Presentation<unknown>;
  }

  private renderPresentation(presentation: Presentation<unknown>, message: PresentedMessage, indent: number): string {
    const prefix = ' '.repeat(indent);
    const details = message.details ?? [];
    return [
      `${prefix}${this.label(presentation.role, presentation.color)} ${message.text}`,
      ...details.map((detail) => this.muted(`${' '.repeat(indent + 2)}${detail}`)),
    ].join('\n');
  }

  private label(name: string, color: PresentationColor): string {
    const label = `[${name}]`;
    return this.colorsEnabled ? `${ANSI[color]}${label}${RESET}` : label;
  }

  private muted(text: string): string {
    return this.colorsEnabled ? `${ANSI.gray}${text}${RESET}` : text;
  }

  private detail(text: string, indent: number, marker?: 'success' | 'failure' | 'warning'): string {
    const prefix = ' '.repeat(indent);
    if (!marker) return this.muted(`${prefix}${text}`);
    const rendered = marker === 'success' ? `✓ ${text}` : marker === 'failure' ? `✗ ${text}` : `⚠ ${text}`;
    if (!this.colorsEnabled) return `${prefix}${rendered}`;
    const color = marker === 'success' ? ANSI.green : marker === 'failure' ? ANSI.red : ANSI.yellow;
    return `${prefix}${color}${rendered}${RESET}`;
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : JSON.parse(serialized);
  } catch {
    return String(value);
  }
}
