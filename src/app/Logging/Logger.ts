import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inspect } from 'node:util';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';

interface ConsolePlanStep { id?: string; goal?: string }

type ConsoleColor = 'gray' | 'cyan' | 'magenta' | 'blue' | 'yellow' | 'green' | 'red';

const ANSI: Record<ConsoleColor, string> = {
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};
const RESET = '\x1b[0m';

/**
 * Human-facing console logger. FileLogger remains the diagnostic source of truth;
 * the console shows compact progress and intentionally hides transport payloads.
 */
export class ConsoleLogger implements EngineLogger {
  private readonly plans = new Map<string, ConsolePlanStep[]>();
  private readonly russian: boolean;
  private readonly colorsEnabled = Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env);

  public constructor(responseLanguage = 'en') {
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

  private label(name: string, color: ConsoleColor): string {
    const label = `[${name}]`;
    return this.colorsEnabled ? `${ANSI[color]}${label}${RESET}` : label;
  }

  private format(event: string, data: unknown): string {
    const record = isRecord(data) ? data : {};
    const app = this.label('App', 'gray');
    const engine = this.label('Engine', 'cyan');
    const planner = this.label('Planner', 'magenta');
    const model = this.label('Model', 'blue');
    const research = this.label('Research', 'yellow');
    const worker = this.label('Worker', 'green');
    const edit = this.label('Edit', 'yellow');

    if (event === 'app.startup') {
      const project = stringValue(record.projectId);
      const logPath = stringValue(record.logPath);
      return this.russian
        ? `${app} Проект: ${project}${logPath ? `\n  Лог: ${logPath}` : ''}`
        : `${app} Project: ${project}${logPath ? `\n  Log: ${logPath}` : ''}`;
    }

    if (event === 'app.exit') return this.russian ? `${app} Завершено.` : `${app} Exited.`;

    if (event === 'engine.task.start') {
      const description = stringValue(record.description);
      return this.russian ? `\n${engine} Новая задача\n  ${description}` : `\n${engine} New task\n  ${description}`;
    }

    if (event === 'engine.plan') {
      const taskId = stringValue(record.taskId);
      const steps = Array.isArray(record.steps) ? record.steps.filter(isRecord).map((step) => ({
        id: stringValue(step.id),
        goal: stringValue(step.goal),
      })) : [];
      if (taskId) this.plans.set(taskId, steps);
      const title = this.russian ? `${planner} План: ${steps.length} шаг(а)` : `${planner} Plan: ${steps.length} step(s)`;
      return [title, ...steps.map((step, index) => `  ${index + 1}. ${step.goal}`)].join('\n');
    }

    if (event === 'engine.step.start') {
      const taskId = stringValue(record.taskId);
      const step = isRecord(record.step) ? record.step : {};
      const stepId = stringValue(step.id);
      const goal = stringValue(step.goal);
      const position = this.stepPosition(taskId, stepId);
      return this.russian ? `\n${engine} Шаг ${position}: ${goal}` : `\n${engine} Step ${position}: ${goal}`;
    }

    if (event === 'engine.worker.selected') {
      const workerId = stringValue(record.workerId);
      return this.russian ? `${engine} Исполнитель: ${workerId}` : `${engine} Worker: ${workerId}`;
    }

    if (event === 'worker.start') {
      const workerId = stringValue(record.workerId);
      const known = numberValue(record.knownAnswers);
      const suffix = known > 0 ? (this.russian ? ` · знаний: ${known}` : ` · known answers: ${known}`) : '';
      return this.russian ? `${worker} ${workerId}: начало${suffix}` : `${worker} ${workerId}: start${suffix}`;
    }



    if (event === 'worker.edit.prepare.start') {
      const path = stringValue(record.path);
      return this.russian ? `${edit} Подготавливаю изменения: ${path}` : `${edit} Preparing changes: ${path}`;
    }

    if (event === 'worker.edit.prepare.finish') {
      const path = stringValue(record.path);
      const operations = numberValue(record.operations);
      const suffix = operations ? (this.russian ? ` · операций: ${operations}` : ` · operations: ${operations}`) : '';
      return this.russian ? `${edit} Изменения подготовлены: ${path}${suffix}` : `${edit} Changes prepared: ${path}${suffix}`;
    }

    if (event === 'worker.edit.prepare.failed') {
      const path = stringValue(record.path);
      const reason = stringValue(record.reason);
      return this.russian ? `${edit} Не удалось подготовить изменения: ${path} · ${reason}` : `${edit} Failed to prepare changes: ${path} · ${reason}`;
    }

    if (event === 'worker.change-set.prepare.start') {
      const edits = numberValue(record.edits);
      return this.russian ? `${edit} Подготавливаю change-set · изменений: ${edits}` : `${edit} Preparing change-set · edits: ${edits}`;
    }

    if (event === 'worker.change-set.file.prepared') return '';

    if (event === 'worker.change-set.prepare.failed') {
      const path = stringValue(record.path);
      return this.russian ? `${edit} Change-set не подготовлен${path ? ` · ${path}` : ''}` : `${edit} Change-set preparation failed${path ? ` · ${path}` : ''}`;
    }

    if (event === 'worker.change-set.commit.start') {
      const files = numberValue(record.files);
      return this.russian ? `${edit} Применяю change-set · файлов: ${files}` : `${edit} Applying change-set · files: ${files}`;
    }

    if (event === 'worker.change-set.commit.finish') {
      const files = numberValue(record.files);
      return this.russian ? `${edit} Change-set применён · файлов: ${files}` : `${edit} Change-set applied · files: ${files}`;
    }

    if (event.startsWith('worker.edit.model.')) return '';

    if (event === 'worker.action.start') {
      const workerId = stringValue(record.workerId);
      const actionId = stringValue(record.actionId);
      const attempt = numberValue(record.attempt);
      const question = compactText(stringValue(record.question), 180);
      const suffix = attempt ? (this.russian ? ` · попытка ${attempt}` : ` · attempt ${attempt}`) : '';
      if (actionId === 'research' && question) {
        return this.russian
          ? `${worker} ${workerId}: action research${suffix}\n  ${question}`
          : `${worker} ${workerId}: action research${suffix}\n  ${question}`;
      }
      return `${worker} ${workerId}: action ${actionId}${suffix}`;
    }

    if (event === 'worker.action.finish') {
      const workerId = stringValue(record.workerId);
      const actionId = stringValue(record.actionId);
      const attempt = numberValue(record.attempt);
      const result = isRecord(record.result) ? record.result : {};
      const status = stringValue(result.status);
      const requests = Array.isArray(result.requests) ? result.requests.length : 0;
      let text = this.russian
        ? `${worker} ${workerId}: ${actionId} · ${humanStatus(status, true)}`
        : `${worker} ${workerId}: ${actionId} · ${humanStatus(status, false)}`;
      if (attempt) text += this.russian ? ` · попытка ${attempt}` : ` · attempt ${attempt}`;
      if (requests) text += this.russian ? ` · запросов: ${requests}` : ` · requests: ${requests}`;
      return text;
    }

    if (event === 'worker.action.error') {
      const workerId = stringValue(record.workerId);
      const actionId = stringValue(record.actionId);
      const attempt = numberValue(record.attempt);
      const error = stringValue(record.error);
      return this.russian
        ? `${worker} ${workerId}: ${actionId} · ошибка${attempt ? ` · попытка ${attempt}` : ''} · ${error}`
        : `${worker} ${workerId}: ${actionId} · error${attempt ? ` · attempt ${attempt}` : ''} · ${error}`;
    }

    if (event === 'worker.attempt') {
      const workerId = stringValue(record.workerId);
      const attempt = numberValue(record.attempt);
      const result = isRecord(record.result) ? record.result : {};
      const status = stringValue(result.status);
      const questions = Array.isArray(result.questions) ? result.questions.map(String) : [];
      let headline = this.russian
        ? `${worker} ${workerId}: попытка ${attempt} · ${humanStatus(status, true)}`
        : `${worker} ${workerId}: attempt ${attempt} · ${humanStatus(status, false)}`;
      if (questions.length > 0) headline += ` (${questions.length})`;
      return [headline, ...questions.map((question) => `  - ${question}`)].join('\n');
    }

    if (event === 'worker.attempt.error') {
      const workerId = stringValue(record.workerId);
      const attempt = numberValue(record.attempt);
      const error = stringValue(record.error);
      return this.russian
        ? `${worker} ${workerId}: попытка ${attempt} · ошибка · ${error}`
        : `${worker} ${workerId}: attempt ${attempt} · error · ${error}`;
    }

    if (event === 'worker.edit.error') {
      const path = stringValue(record.path);
      const attempt = numberValue(record.editAttempt);
      const max = numberValue(record.maxEditAttempts);
      return this.russian
        ? `${worker} edit: ${path} · diff не применился (${attempt}/${max}), пробую восстановить`
        : `${worker} edit: ${path} · diff failed (${attempt}/${max}), trying recovery`;
    }

    if (event === 'worker.edit.recovered') {
      const path = stringValue(record.path);
      const attempt = numberValue(record.editAttempt);
      return this.russian
        ? `${worker} edit: ${path} · восстановлена на попытке ${attempt}`
        : `${worker} edit: ${path} · recovered on attempt ${attempt}`;
    }

    if (event === 'research.hit') {
      const question = stringValue(record.question);
      return this.russian ? `${research} Кеш: ${question}` : `${research} Cache hit: ${question}`;
    }

    if (event === 'research.miss') {
      const question = stringValue(record.question);
      return this.russian ? `${research} Ищу: ${question}` : `${research} Searching: ${question}`;
    }

    if (event === 'research.resolved') {
      const sources = Array.isArray(record.sources) ? record.sources.length : 0;
      return this.russian ? `${research} Ответ найден · источников: ${sources}` : `${research} Resolved · sources: ${sources}`;
    }

    if (event === 'research.not-found') {
      const question = stringValue(record.question);
      return this.russian ? `${research} Не найдено: ${question}` : `${research} Not found: ${question}`;
    }

    if (event === 'model.run.start') {
      const kind = stringValue(record.kind);
      const path = stringValue(record.path);
      const message = compactText(stringValue(record.message), 120);
      if (kind === 'diff') return `${model} diff request${path ? `: ${path}` : ''}`;
      return `${model} request${message ? `: ${message}` : ''}`;
    }

    if (event === 'model.run' || event === 'model.run.error') {
      const meta = isRecord(record.meta) ? record.meta : {};
      const seconds = typeof meta.durationMs === 'number' ? `${(meta.durationMs / 1000).toFixed(1)}s` : undefined;
      const tokens = typeof meta.totalTokens === 'number' ? `${meta.totalTokens} tok` : undefined;
      const summary = summarizeModelData(record.data, this.russian);
      const parts = [summary, seconds, tokens].filter(Boolean);
      return `${model} ${parts.join(' · ') || (this.russian ? 'ответ получен' : 'response received')}`;
    }

    if (event === 'worker.agent.finish') {
      const status = stringValue(record.status);
      const meta = isRecord(record.meta) ? record.meta : {};
      const rounds = numberValue(meta.rounds);
      return this.russian
        ? `${worker} agent: ${humanStatus(status, true)}${rounds ? ` · раундов: ${rounds}` : ''}`
        : `${worker} agent: ${humanStatus(status, false)}${rounds ? ` · rounds: ${rounds}` : ''}`;
    }

    if (event === 'engine.step.finish') {
      const taskId = stringValue(record.taskId);
      const stepId = stringValue(record.stepId);
      const position = this.stepPosition(taskId, stepId);
      const status = stringValue(record.status);
      return this.russian ? `${engine} Шаг ${position}: ${humanStatus(status, true)}` : `${engine} Step ${position}: ${humanStatus(status, false)}`;
    }

    if (event === 'engine.task.finish') {
      const taskId = stringValue(record.taskId);
      if (taskId) this.plans.delete(taskId);
      const status = stringValue(record.status);
      return this.russian ? `${engine} Итог: ${humanStatus(status, true)}` : `${engine} Result: ${humanStatus(status, false)}`;
    }

    if (event === 'engine.execution.sample') return '';
    if (event.startsWith('project.') || event.startsWith('research.cache')) return '';
    if (event.startsWith('test.')) return '';

    const details = data === undefined ? '' : ` ${inspect(data, { depth: 3, maxArrayLength: 6, maxStringLength: 300, breakLength: 140, compact: true })}`;
    const fallback = levelLabel(event);
    return `${fallback}${details}`;
  }

  private stepPosition(taskId: string, stepId: string): string {
    const steps = this.plans.get(taskId) ?? [];
    const index = steps.findIndex((step) => step.id === stepId);
    return index >= 0 ? `${index + 1}/${steps.length}` : stepId || '?';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value : value == null ? '' : String(value); }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : 0; }
function compactText(value: string, max: number): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length <= max ? singleLine : `${singleLine.slice(0, max - 1)}…`;
}
function levelLabel(event: string): string { return `[${event}]`; }

function humanStatus(status: string, russian: boolean): string {
  if (!russian) return status || 'unknown';
  if (status === 'completed') return 'завершено';
  if (status === 'not-completed') return 'не завершено';
  if (status === 'failed') return 'ошибка';
  if (status === 'missing-information') return 'не хватает информации';
  if (status === 'ready') return 'готово';
  return status || 'неизвестно';
}

function summarizeModelData(data: unknown, russian: boolean): string {
  if (!isRecord(data)) return russian ? 'ответ модели' : 'model response';
  if (Array.isArray(data.steps)) return russian ? `план: ${data.steps.length} шаг(а)` : `plan: ${data.steps.length} step(s)`;
  if (typeof data.optionId === 'string') return russian ? `выбор: ${data.optionId}` : `selected: ${data.optionId}`;
  if (typeof data.outcome === 'string') {
    if (data.outcome === 'missing-information' && Array.isArray(data.questions)) return russian ? `нужны данные: ${data.questions.length}` : `missing information: ${data.questions.length}`;
    if (data.outcome === 'ready' && Array.isArray(data.edits)) return russian ? `изменения готовы: ${data.edits.length}` : `edits ready: ${data.edits.length}`;
    return `outcome: ${data.outcome}`;
  }
  if (typeof data.path === 'string' && Array.isArray(data.hunks)) return `diff: ${data.path} · hunks: ${data.hunks.length}`;
  if (typeof data.text === 'string') return russian ? 'ответ модели' : 'model answer';
  return russian ? 'ответ модели' : 'model response';
}
