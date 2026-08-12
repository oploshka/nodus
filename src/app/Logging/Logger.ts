import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inspect } from 'node:util';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';

interface ConsolePlanStep { id?: string; goal?: string }

/**
 * Human-facing console logger. The file logger remains the diagnostic source of truth;
 * this logger deliberately translates low-level runtime events into a compact progress view.
 */
export class ConsoleLogger implements EngineLogger {
  private readonly plans = new Map<string, ConsolePlanStep[]>();
  private readonly russian: boolean;

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

  private format(event: string, data: unknown): string {
    const record = isRecord(data) ? data : {};

    if (event === 'app.startup') {
      const project = stringValue(record.projectId);
      const logPath = stringValue(record.logPath);
      return this.russian
        ? `[Приложение] Проект: ${project}${logPath ? `\n  Лог: ${logPath}` : ''}`
        : `[App] Project: ${project}${logPath ? `\n  Log: ${logPath}` : ''}`;
    }

    if (event === 'app.exit') return this.russian ? '[Приложение] Завершено.' : '[App] Exited.';

    if (event === 'engine.task.start') {
      const description = stringValue(record.description);
      return this.russian ? `\n[Движок] Новая задача\n  ${description}` : `\n[Engine] New task\n  ${description}`;
    }

    if (event === 'engine.plan') {
      const taskId = stringValue(record.taskId);
      const steps = Array.isArray(record.steps) ? record.steps.filter(isRecord).map((step) => ({
        id: stringValue(step.id),
        goal: stringValue(step.goal),
      })) : [];
      if (taskId) this.plans.set(taskId, steps);
      const title = this.russian ? `[Планировщик] План: ${steps.length} шаг(а)` : `[Planner] Plan: ${steps.length} step(s)`;
      return [title, ...steps.map((step, index) => `  ${index + 1}. ${step.goal}`)].join('\n');
    }

    if (event === 'engine.step.start') {
      const taskId = stringValue(record.taskId);
      const step = isRecord(record.step) ? record.step : {};
      const stepId = stringValue(step.id);
      const goal = stringValue(step.goal);
      const position = this.stepPosition(taskId, stepId);
      return this.russian
        ? `\n[Движок] Шаг ${position}: ${goal}`
        : `\n[Engine] Step ${position}: ${goal}`;
    }

    if (event === 'engine.worker.selected') {
      const worker = stringValue(record.workerId);
      return this.russian ? `  [Движок] Исполнитель: ${worker}` : `  [Engine] Worker: ${worker}`;
    }

    if (event === 'worker.start') {
      const worker = stringValue(record.workerId);
      const known = numberValue(record.knownAnswers);
      const suffix = known > 0 ? (this.russian ? ` · знаний: ${known}` : ` · known answers: ${known}`) : '';
      return this.russian ? `  [Worker:${worker}] Начало${suffix}` : `  [Worker:${worker}] Start${suffix}`;
    }

    if (event === 'worker.attempt') {
      const worker = stringValue(record.workerId);
      const attempt = numberValue(record.attempt);
      const result = isRecord(record.result) ? record.result : {};
      const status = stringValue(result.status);
      const questions = Array.isArray(result.questions) ? result.questions.map(String) : [];
      let headline = this.russian ? `  [Worker:${worker}] Попытка ${attempt}: ${humanStatus(status, true)}` : `  [Worker:${worker}] Attempt ${attempt}: ${humanStatus(status, false)}`;
      if (questions.length > 0) headline += ` (${questions.length})`;
      return [headline, ...questions.map((question) => `    - ${question}`)].join('\n');
    }

    if (event === 'worker.attempt.error') {
      const worker = stringValue(record.workerId);
      const attempt = numberValue(record.attempt);
      const error = stringValue(record.error);
      return this.russian
        ? `  [Worker:${worker}] Попытка ${attempt}: ошибка · ${error}`
        : `  [Worker:${worker}] Attempt ${attempt}: error · ${error}`;
    }

    if (event === 'worker.edit.error') {
      const path = stringValue(record.path);
      const attempt = numberValue(record.editAttempt);
      const max = numberValue(record.maxEditAttempts);
      return this.russian
        ? `  [Worker] Правка ${path}: diff не применился (${attempt}/${max}), пробую восстановить`
        : `  [Worker] Edit ${path}: diff failed (${attempt}/${max}), trying recovery`;
    }

    if (event === 'worker.edit.recovered') {
      const path = stringValue(record.path);
      const attempt = numberValue(record.editAttempt);
      return this.russian
        ? `  [Worker] Правка ${path}: восстановлена на попытке ${attempt}`
        : `  [Worker] Edit ${path}: recovered on attempt ${attempt}`;
    }

    if (event === 'research.miss') {
      const question = stringValue(record.question);
      return this.russian ? `    [Research] Ищу: ${question}` : `    [Research] Searching: ${question}`;
    }

    if (event === 'research.resolved') {
      const sources = Array.isArray(record.sources) ? record.sources.length : 0;
      return this.russian ? `    [Research] Ответ найден · источников: ${sources}` : `    [Research] Resolved · sources: ${sources}`;
    }

    if (event === 'research.not-found') {
      const question = stringValue(record.question);
      return this.russian ? `    [Research] Не найдено: ${question}` : `    [Research] Not found: ${question}`;
    }

    if (event === 'model.run' || event === 'model.run.error') {
      const meta = isRecord(record.meta) ? record.meta : {};
      const seconds = typeof meta.durationMs === 'number' ? `${(meta.durationMs / 1000).toFixed(1)}s` : undefined;
      const tokens = typeof meta.totalTokens === 'number' ? `${meta.totalTokens} tok` : undefined;
      const summary = summarizeModelData(record.data, this.russian);
      const parts = [summary, seconds, tokens].filter(Boolean);
      return `    [ИИ] ${parts.join(' · ') || (this.russian ? 'вызов модели' : 'model call')}`;
    }

    if (event === 'worker.agent.finish') {
      const status = stringValue(record.status);
      const meta = isRecord(record.meta) ? record.meta : {};
      const rounds = numberValue(meta.rounds);
      return this.russian
        ? `  [Worker:agent] ${humanStatus(status, true)}${rounds ? ` · раундов: ${rounds}` : ''}`
        : `  [Worker:agent] ${humanStatus(status, false)}${rounds ? ` · rounds: ${rounds}` : ''}`;
    }

    if (event === 'engine.step.finish') {
      const taskId = stringValue(record.taskId);
      const stepId = stringValue(record.stepId);
      const position = this.stepPosition(taskId, stepId);
      const status = stringValue(record.status);
      return this.russian
        ? `[Движок] Шаг ${position}: ${humanStatus(status, true)}`
        : `[Engine] Step ${position}: ${humanStatus(status, false)}`;
    }

    if (event === 'engine.task.finish') {
      const taskId = stringValue(record.taskId);
      if (taskId) this.plans.delete(taskId);
      const status = stringValue(record.status);
      return this.russian ? `[Движок] Итог: ${humanStatus(status, true)}` : `[Engine] Result: ${humanStatus(status, false)}`;
    }

    // Detailed samples and transport diagnostics belong in FileLogger, not in the human console.
    if (event === 'engine.execution.sample') return '';

    if (event.startsWith('project.') || event.startsWith('research.cache')) return '';

    const details = data === undefined ? '' : ` ${inspect(data, { depth: 3, maxArrayLength: 6, maxStringLength: 300, breakLength: 140, compact: true })}`;
    return `[${event}]${details}`;
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

function summarizeModelData(value: unknown, russian: boolean): string {
  if (!isRecord(value)) return russian ? 'ответ модели' : 'model response';
  if (Array.isArray(value.steps)) return russian ? `план: ${value.steps.length} шаг(а)` : `plan: ${value.steps.length} step(s)`;
  if (typeof value.optionId === 'string') return russian ? `выбор: ${value.optionId}` : `selected: ${value.optionId}`;
  if (typeof value.outcome === 'string') {
    const questions = Array.isArray(value.questions) ? value.questions.length : 0;
    const edits = Array.isArray(value.edits) ? value.edits.length : 0;
    if (value.outcome === 'missing-information') return russian ? `нужны данные: ${questions}` : `missing information: ${questions}`;
    if (value.outcome === 'ready') return russian ? `изменения готовы: ${edits}` : `edits ready: ${edits}`;
    return russian ? `результат: ${value.outcome}` : `outcome: ${value.outcome}`;
  }
  if (typeof value.path === 'string' && Array.isArray(value.hunks)) return russian ? `diff: ${value.path} · hunks: ${value.hunks.length}` : `diff: ${value.path} · hunks: ${value.hunks.length}`;
  return russian ? 'ответ модели' : 'model response';
}

function humanStatus(status: string, russian: boolean): string {
  const ru: Record<string, string> = {
    completed: 'завершено',
    'not-completed': 'не завершено',
    failed: 'ошибка',
    'missing-information': 'не хватает информации',
    ready: 'готово к выполнению',
  };
  const en: Record<string, string> = {
    completed: 'completed',
    'not-completed': 'not completed',
    failed: 'failed',
    'missing-information': 'missing information',
    ready: 'ready',
  };
  return (russian ? ru : en)[status] ?? status;
}

function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : 0; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === 'object' && value !== null; }
