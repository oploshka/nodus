import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  sEngineEventEnvelope,
  tEngineEventListener,
  tEngineStepColor,
} from '@engine/Core/EngineStepInterface.js';

const ANSI: Record<tEngineStepColor, string> = {
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

interface EngineEventSubscriber {
  handle(envelope: sEngineEventEnvelope): void;
}

export class CompositeEventSubscriber {
  public constructor(private readonly subscribers: readonly EngineEventSubscriber[]) {}

  public readonly listener: tEngineEventListener = (event) => {
    for (const subscriber of this.subscribers) subscriber.handle(event);
  };
}

export class ConsoleEventSubscriber implements EngineEventSubscriber {
  private readonly russian: boolean;
  private readonly colorsEnabled = Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env);

  public constructor(responseLanguage = 'en') {
    this.russian = responseLanguage.toLowerCase().startsWith('ru');
  }

  public handle(envelope: sEngineEventEnvelope): void {
    const text = this.format(envelope);
    if (!text) return;

    if (envelope.event.level === 'error') console.error(text);
    else if (envelope.event.level === 'warning') console.warn(text);
    else console.log(text);
  }

  private format(envelope: sEngineEventEnvelope): string {
    const { event } = envelope;
    const data = isRecord(event.data) ? event.data : {};

    if (event.type === 'app.startup') {
      const project = stringValue(data.projectId);
      const logPath = stringValue(data.logPath);
      const app = this.label('App', 'gray');
      return this.russian
        ? `${app} Проект: ${project}${logPath ? `\n  Лог: ${logPath}` : ''}`
        : `${app} Project: ${project}${logPath ? `\n  Log: ${logPath}` : ''}`;
    }

    if (event.type === 'app.exit') {
      return this.russian ? `${this.label('App', 'gray')} Завершено.` : `${this.label('App', 'gray')} Exited.`;
    }

    if (event.type === 'project.scan') {
      const files = numberValue(data.files);
      return this.russian
        ? `${this.label('Project', 'cyan')} Проиндексировано файлов: ${files}`
        : `${this.label('Project', 'cyan')} Indexed files: ${files}`;
    }

    const metadata = envelope.step?.getMetadata();
    const stepIndent = Math.max(0, envelope.path.length - 1) * 2;
    const innerIndent = stepIndent + 2;

    if (event.type === 'step.start' && metadata) {
      if (metadata.code === 'ActionUserInputCli') return '';
      const code = metadata.code === metadata.title ? '' : ` ${metadata.code}`;
      const description = metadata.description ? ` · ${metadata.description}` : '';
      return `${' '.repeat(stepIndent)}${this.label(metadata.title, metadata.color)}${code}${description}`;
    }

    // A Step may return FAILURE as part of normal schema control flow. The runtime
    // trace/file event keeps the result; the console only renders thrown step errors.
    if (event.type === 'step.finish') return '';

    if (event.type === 'step.error') {
      return this.detail(stringValue(data.reason), stepIndent, 'failure');
    }

    if (event.type === 'model.start') {
      return `${' '.repeat(innerIndent)}${this.label('Model', 'blue')} ${this.russian ? 'Обрабатываю...' : 'Processing...'}`;
    }

    if (event.type === 'model.finish') {
      const meta = isRecord(data.meta) ? data.meta : {};
      const prompt = numberValue(meta.promptTokens);
      const completion = numberValue(meta.completionTokens);
      const total = numberValue(meta.totalTokens) || prompt + completion;
      const durationMs = numberValue(meta.durationMs);
      const duration = durationMs > 0 ? ` · ${(durationMs / 1000).toFixed(1)}s` : '';
      const tokens = total > 0 ? ` · ${prompt} → ${completion} = ${total} tok` : '';
      return `${' '.repeat(innerIndent)}${this.label('Model', 'blue')} ${this.russian ? 'Ответ получен' : 'Response received'}${tokens}${duration}`;
    }

    if (event.type === 'model.error') {
      const error = isRecord(data.error) ? data.error : {};
      return this.detail(stringValue(error.message) || (this.russian ? 'Ошибка модели' : 'Model error'), innerIndent, 'failure');
    }

    if (event.type === 'edit.prepare.start') {
      const files = numberValue(data.edits);
      const text = this.russian ? `Подготавливаю набор изменений · файлов: ${files}` : `Preparing change set · files: ${files}`;
      return `${' '.repeat(innerIndent)}${this.label('Edit', 'brightCyan')} ${text}`;
    }

    if (event.type === 'edit.file.start') {
      return this.muted(`${' '.repeat(innerIndent + 2)}${stringValue(data.path)}`);
    }

    if (event.type === 'edit.file.finish') {
      const operations = numberValue(data.operations);
      const text = this.russian ? `Подготовлено · ${operations} операций` : `Prepared · ${operations} operations`;
      return this.detail(text, innerIndent + 2, 'success');
    }

    if (event.type === 'edit.file.failed') {
      return this.detail(stringValue(data.reason), innerIndent + 2, 'failure');
    }

    if (event.type === 'edit.strategy.retry') {
      const attempt = numberValue(data.editAttempt);
      const text = this.russian
        ? `Замена не применена · уточняю · попытка ${attempt}`
        : `Edit did not apply · retrying · attempt ${attempt}`;
      return this.detail(text, innerIndent + 2, 'warning');
    }

    if (event.type === 'edit.strategy.recovered') {
      const attempt = numberValue(data.editAttempt);
      const text = this.russian ? `Изменение уточнено · попытка ${attempt}` : `Edit recovered · attempt ${attempt}`;
      return this.detail(text, innerIndent + 2, 'success');
    }

    if (event.type === 'edit.strategy.fallback') {
      const from = stringValue(data.fromStrategy);
      const to = stringValue(data.toStrategy);
      const text = this.russian ? `Стратегия ${from} → ${to}` : `Strategy ${from} → ${to}`;
      return this.detail(text, innerIndent + 2, 'warning');
    }

    if (event.type === 'edit.validation.warning' || event.type === 'edit.validation.failed') {
      return this.detail(stringValue(data.reason), innerIndent + 2, 'warning');
    }

    if (event.type === 'edit.commit.start' || event.type === 'edit.commit.finish') {
      const files = numberValue(data.files);
      const start = event.type.endsWith('.start');
      const text = this.russian
        ? `${start ? 'Применяю' : 'Набор изменений применён'} · файлов: ${files}`
        : `${start ? 'Applying change set' : 'Change set applied'} · files: ${files}`;
      return `${' '.repeat(envelope.path.length === 0 ? 2 : innerIndent)}${this.label('Edit', 'brightCyan')} ${text}`;
    }

    if (event.type === 'edit.rollback.failed') {
      return this.detail(stringValue(data.error), innerIndent, 'failure');
    }

    if (event.level === 'warning' || event.level === 'error') {
      return this.detail(event.type, innerIndent, event.level === 'error' ? 'failure' : 'warning');
    }

    return '';
  }

  private label(name: string, color: tEngineStepColor): string {
    const label = `[${name}]`;
    return this.colorsEnabled ? `${ANSI[color]}${label}${RESET}` : label;
  }

  private muted(text: string): string {
    return this.colorsEnabled ? `${ANSI.gray}${text}${RESET}` : text;
  }

  private detail(text: string, indent: number, marker: 'success' | 'failure' | 'warning'): string {
    const rendered = marker === 'success' ? `✓ ${text}` : marker === 'failure' ? `✗ ${text}` : `⚠ ${text}`;
    if (!this.colorsEnabled) return `${' '.repeat(indent)}${rendered}`;
    const color = marker === 'success' ? ANSI.green : marker === 'failure' ? ANSI.red : ANSI.yellow;
    return `${' '.repeat(indent)}${color}${rendered}${RESET}`;
  }
}

export class FileEventSubscriber implements EngineEventSubscriber {
  public constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  public handle(envelope: sEngineEventEnvelope): void {
    appendFileSync(this.path, `${JSON.stringify({
      at: new Date().toISOString(),
      path: envelope.path,
      module: envelope.module,
      step: envelope.step?.getMetadata(),
      event: envelope.event.type,
      level: envelope.event.level ?? 'info',
      data: serialize(envelope.event.data),
    })}\n`, 'utf8');
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
