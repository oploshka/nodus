import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inspect } from 'node:util';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Presentation, PresentationColor, PresentedMessage } from '@engine/Presentation/Presentation.js';
import { TaskExecutionMetricsTracker } from '@engine/Metrics/TaskExecutionMetrics.js';

interface ConsolePlanStep { id?: string; goal?: string }

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

/**
 * Human-facing console logger. FileLogger remains the diagnostic source of truth;
 * the console shows compact progress and intentionally hides transport payloads.
 */
export class ConsoleLogger implements EngineLogger {
  private readonly plans = new Map<string, ConsolePlanStep[]>();
  private readonly russian: boolean;
  private readonly responseLanguage: string;
  private readonly colorsEnabled = Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env);
  private modelIndent = 4;
  private readonly metrics = new TaskExecutionMetricsTracker();

  public constructor(responseLanguage = 'en') {
    this.responseLanguage = responseLanguage;
    this.russian = responseLanguage.toLowerCase().startsWith('ru');
  }

  public info(event: string, data?: unknown): void { this.print('info', event, data); }
  public warn(event: string, data?: unknown): void { this.print('warn', event, data); }
  public error(event: string, data?: unknown): void { this.print('error', event, data); }

  private print(level: 'info' | 'warn' | 'error', event: string, data?: unknown): void {
    this.metrics.observe(event, data);
    const text = this.format(event, data);
    if (!text) return;
    if (level === 'error') console.error(text);
    else if (level === 'warn') console.warn(text);
    else console.log(text);
  }

  private label(name: string, color: PresentationColor): string {
    const label = `[${name}]`;
    return this.colorsEnabled ? `${ANSI[color]}${label}${RESET}` : label;
  }

  private muted(text: string): string {
    return this.colorsEnabled ? `${ANSI.gray}${text}${RESET}` : text;
  }

  private detail(text: string, indent: number, marker?: 'success' | 'failure'): string {
    const prefix = ' '.repeat(indent);
    const rendered = marker === 'success' ? `✓ ${text}` : marker === 'failure' ? `✗ ${text}` : text;
    if (!this.colorsEnabled || !marker) return marker ? `${prefix}${rendered}` : this.muted(`${prefix}${rendered}`);
    const color = marker === 'success' ? ANSI.green : ANSI.red;
    return `${prefix}${color}${rendered}${RESET}`;
  }

  private renderPresentation(presentation: Presentation<unknown>, message: PresentedMessage, indent: number): string {
    const label = this.label(presentation.role, presentation.color);
    const prefix = ' '.repeat(indent);
    const details = message.details ?? [];
    return [
      `${prefix}${label} ${message.text}`,
      ...details.map((detail) => this.muted(`${' '.repeat(indent + 2)}${detail}`)),
    ].join('\n');
  }

  private presentation(value: unknown): Presentation<unknown> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<Presentation<unknown>>;
    return typeof candidate.role === 'string' && typeof candidate.color === 'string' && typeof candidate.format === 'function'
      ? candidate as Presentation<unknown>
      : undefined;
  }

  private format(event: string, data: unknown): string {
    const record = isRecord(data) ? data : {};
    const app = this.label('App', 'gray');
    const engine = this.label('Engine', 'white');

    if (event === 'app.startup') {
      const project = stringValue(record.projectId);
      const logPath = stringValue(record.logPath);
      return this.russian
        ? `${app} Проект: ${project}${logPath ? `\n  Лог: ${logPath}` : ''}`
        : `${app} Project: ${project}${logPath ? `\n  Log: ${logPath}` : ''}`;
    }

    if (event === 'app.exit') return this.russian ? `${app} Завершено.` : `${app} Exited.`;

    if (event === 'engine.task.start') {
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'task-start' }, this.responseLanguage);
      return message ? `\n${this.renderPresentation(presentation, message, 0)}` : '';
    }

    if (event === 'planner.plan.start') {
      this.modelIndent = 4;
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'start' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'planner.plan.finish') return '';

    if (event === 'determine.start') {
      this.modelIndent = 4;
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'start' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'determine.finish') {
      const optionId = stringValue(record.optionId);
      const workerPresentation = record.workerPresentation as { name?: (language?: string) => string } | undefined;
      const workerName = workerPresentation?.name?.(this.responseLanguage) || stringValue(record.workerName) || optionId;
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'finish', workerName }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'engine.execution.start') {
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'execution-start' }, this.responseLanguage);
      return message ? `\n${this.renderPresentation(presentation, message, 0)}` : '';
    }

    if (event === 'engine.plan') {
      const taskId = stringValue(record.taskId);
      const steps = Array.isArray(record.steps) ? record.steps.filter(isRecord).map((step) => ({
        id: stringValue(step.id),
        goal: stringValue(step.goal),
      })) : [];
      if (taskId) this.plans.set(taskId, steps);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'finish', steps }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'engine.step.start') {
      const taskId = stringValue(record.taskId);
      const step = isRecord(record.step) ? record.step : {};
      const stepId = stringValue(step.id);
      const goal = stringValue(step.goal);
      const position = this.stepPosition(taskId, stepId);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'step-start', position, goal }, this.responseLanguage);
      return message ? `
${this.renderPresentation(presentation, message, 0)}` : '';
    }

    if (event === 'engine.worker.selected') return '';

    if (event === 'worker.start') {
      const known = numberValue(record.knownAnswers);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'start', knownAnswers: known }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }


    if (event === 'engine.edit.file.start') {
      const path = stringValue(record.path);
      this.modelIndent = 6;
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'file-prepare', path }, this.responseLanguage);
      return message ? this.detail(message.text, 4) : '';
    }

    if (event === 'engine.edit.file.finish') {
      const path = stringValue(record.path);
      const operations = numberValue(record.operations);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'file-prepared', path, operations }, this.responseLanguage);
      return message ? this.detail(message.text, 4, 'success') : '';
    }

    if (event === 'engine.edit.file.failed') {
      const path = stringValue(record.path);
      const reason = stringValue(record.reason);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'file-failed', path, reason }, this.responseLanguage);
      return message ? this.detail(message.text, 4, 'failure') : '';
    }

    if (event === 'engine.edit.prepare.start') {
      const files = numberValue(record.files) || numberValue(record.edits);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'change-set-prepare', files }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    

    if (event === 'engine.edit.prepare.failed') {
      const path = stringValue(record.path);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'change-set-failed', path }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'engine.edit.commit.start') {
      const files = numberValue(record.files);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'commit-start', files }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'engine.edit.commit.finish') {
      const files = numberValue(record.files);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'commit-finish', files }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'validation.start') {
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'start' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'validation.passed') {
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'passed' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'validation.failed') {
      const reason = stringValue(record.reason);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'failed', reason }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'engine.edit.model.model.run.start') {
      this.modelIndent = 6;
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'start' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, this.modelIndent) : '';
    }

    if (event === 'engine.edit.model.model.run' || event === 'engine.edit.model.model.run.error') {
      return this.formatModelResult(record);
    }

    if (event.startsWith('engine.edit.model.')) return '';

    if (event === 'worker.action.start') {
      const actionId = stringValue(record.actionId);
      const attempt = numberValue(record.attempt);
      const question = compactText(stringValue(record.question), 220);

      if (actionId === 'research') {
        this.modelIndent = 6;
        const requestIndex = numberValue(record.requestIndex);
        const maxRequests = numberValue(record.maxRequests);
        const position = requestIndex > 0 ? `${requestIndex}${maxRequests > 0 ? `/${maxRequests}` : ''}` : '';
        const presentation = this.presentation(record.actionPresentation);
        const message = presentation?.format({ type: 'question', index: requestIndex, max: maxRequests, question }, this.responseLanguage);
        return message ? this.renderPresentation(presentation, message, 4) : '';
      }

      this.modelIndent = 6;
      const presentation = this.presentation(record.actionPresentation);
      const message = presentation?.format({ type: 'start', attempt }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 4) : '';
    }

    if (event === 'worker.action.finish') {
      const actionId = stringValue(record.actionId);
      if (actionId === 'research') return '';
      const attempt = numberValue(record.attempt);
      const result = isRecord(record.result) ? record.result : {};
      const status = stringValue(result.status);
      const requests = Array.isArray(result.requests) ? result.requests.length : 0;
      const presentation = this.presentation(record.actionPresentation);
      const message = presentation?.format({ type: 'finish', attempt, status, requests }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 4) : '';
    }

    if (event === 'worker.action.error') {
      const actionId = stringValue(record.actionId);
      const attempt = numberValue(record.attempt);
      const error = stringValue(record.error);
      const presentation = this.presentation(record.actionPresentation);
      const message = presentation?.format({ type: 'error', attempt, error }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 4) : '';
    }

    if (event === 'engine.edit.error') {
      const path = stringValue(record.path);
      const attempt = numberValue(record.editAttempt);
      const max = numberValue(record.maxEditAttempts);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'diff-error', path, attempt, max }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 6) : '';
    }

    if (event === 'engine.edit.recovered') {
      const path = stringValue(record.path);
      const attempt = numberValue(record.editAttempt);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'diff-recovered', path, attempt }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 6) : '';
    }

    if (event === 'research.hit') {
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'cache-hit' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 4) : '';
    }

    if (event === 'research.miss') {
      this.modelIndent = 6;
      return '';
    }

    if (event === 'research.resolved') {
      const sources = Array.isArray(record.sources) ? record.sources.length : 0;
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'resolved', sources }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 4) : '';
    }

    if (event === 'research.not-found') {
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'not-found' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 4) : '';
    }

    if (event === 'model.run.start') {
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'start' }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, this.modelIndent) : '';
    }

    if (event === 'model.run' || event === 'model.run.error') {
      return this.formatModelResult(record);
    }

    if (event === 'worker.agent.finish') {
      const status = stringValue(record.status);
      const meta = isRecord(record.meta) ? record.meta : {};
      const rounds = numberValue(meta.rounds);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'finish', status, rounds }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 2) : '';
    }

    if (event === 'engine.step.finish') {
      const taskId = stringValue(record.taskId);
      const stepId = stringValue(record.stepId);
      const position = this.stepPosition(taskId, stepId);
      const status = stringValue(record.status);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'step-finish', position, status }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 0) : '';
    }

    if (event === 'engine.task.finish') {
      const taskId = stringValue(record.taskId);
      if (taskId) this.plans.delete(taskId);
      const status = stringValue(record.status);
      const reason = stringValue(record.reason);
      const canContinue = Boolean(record.canContinue);
      const presentation = this.presentation(record.presentation);
      const message = presentation?.format({ type: 'task-finish', status, reason: reason || undefined, canContinue, metrics: this.metrics.snapshot() }, this.responseLanguage);
      return message ? this.renderPresentation(presentation, message, 0) : '';
    }

    if (event === 'engine.execution.sample') return '';
    if (event.startsWith('project.') || event.startsWith('research.cache')) return '';
    if (event.startsWith('test.')) return '';

    const details = data === undefined ? '' : ` ${inspect(data, { depth: 3, maxArrayLength: 6, maxStringLength: 300, breakLength: 140, compact: true })}`;
    const fallback = levelLabel(event);
    return `${fallback}${details}`;
  }


  private formatModelResult(record: Record<string, unknown>): string {
    const presentation = this.presentation(record.presentation);
    const meta = isRecord(record.meta) ? record.meta : {};
    const message = presentation?.format({ type: 'finish', meta }, this.responseLanguage);
    return message ? this.renderPresentation(presentation, message, this.modelIndent) : '';
  }

  private stepPosition(taskId: string, stepId: string): string {
    const steps = this.plans.get(taskId) ?? [];
    const index = steps.findIndex((step) => step.id === stepId);
    return index >= 0 ? `${index + 1}` : stepId || '?';
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


