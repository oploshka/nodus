// ExecutionReporter.ts
import type { ConsoleMode } from '@core/Configuration/Configuration';

export class ExecutionReporter {
  public constructor(
    private readonly mode: ConsoleMode,
    private readonly colors: boolean,
  ) {}

  public task(description: string): void {
    if (this.mode === 'quiet') return;
    this.line(this.paint('cyan', '────────────────────────────────────────'));
    this.line(`${this.paint('bold', '● Получена задача')}\n  ${description}`);
  }

  public step(step: number, operation: string): void {
    if (this.mode === 'quiet') return;
    this.line(`\n${this.paint('cyan', `→ Шаг ${step}: ${this.operationName(operation)}`)}`);
  }

  public note(operation: string, message?: string): void {
    if (this.mode === 'quiet' || !message?.trim()) return;
    const prefix = operation === 'plan' ? '◆ План' : '  '; 
    this.line(`${this.paint(operation === 'plan' ? 'bold' : 'dim', prefix)} ${message.trim()}`);
  }

  public transition(from: string | undefined, to: string, reason: string): void {
    const correctionReasons = new Set(['invalid-model-transition', 'understand-no-progress', 'model-error', 'operation-failed']);
    if (this.mode === 'quiet') return;
    if (correctionReasons.has(reason)) {
      this.line(this.paint('yellow', `◆ План скорректирован: ${from ?? '?'} → ${to}`));
      return;
    }
    if (this.mode === 'verbose') {
      this.line(this.paint('dim', `  ↳ ${from ?? '?'} → ${to} (${reason})`));
    }
  }

  public modelResponse(operation: string, durationMs: number, promptTokens?: number, completionTokens?: number): void {
    if (this.mode !== 'verbose') return;
    const tokens = promptTokens !== undefined
      ? ` · ${promptTokens} → ${completionTokens ?? 0} токенов`
      : '';
    this.line(this.paint('dim', `  ✓ Ответ модели (${operation}) за ${(durationMs / 1000).toFixed(1)} сек${tokens}`));
  }

  public tools(count: number): void {
    if (this.mode !== 'verbose' || count <= 0) return;
    this.line(this.paint('dim', `  ↳ Выполнено инструментов: ${count}`));
  }

  public changes(paths: string[]): void {
    if (this.mode === 'quiet' || paths.length === 0) return;
    for (const path of paths) this.line(`${this.paint('green', '✓ Изменён')} ${path}`);
  }

  public warning(message: string): void {
    if (this.mode === 'quiet') return;
    this.line(this.paint('yellow', `! ${message}`));
  }

  public completed(result: string, durationMs: number, changedFiles: number): void {
    this.line(`\n${this.paint('green', `✓ Задача выполнена за ${(durationMs / 1000).toFixed(1)} сек`)}`);
    if (changedFiles > 0) this.line(this.paint('dim', `  Изменено файлов: ${changedFiles}`));
    this.line(`\n${result}`);
    if (this.mode !== 'quiet') this.line(this.paint('cyan', '────────────────────────────────────────'));
  }

  public failed(result: string, durationMs: number): void {
    this.line(`\n${this.paint('red', `✗ Задача завершилась с ошибкой за ${(durationMs / 1000).toFixed(1)} сек`)}`);
    this.line(result);
    if (this.mode !== 'quiet') this.line(this.paint('cyan', '────────────────────────────────────────'));
  }

  private operationName(operation: string): string {
    const names: Record<string, string> = {
      plan: 'планирование', search: 'поиск', understand: 'анализ', implement: 'реализация',
      review: 'проверка изменений', verify: 'верификация', finalize: 'подготовка результата',
      'resolve-failure': 'разбор ошибки', 'extract-knowledge': 'извлечение знаний',
    };
    return names[operation] ?? operation;
  }

  private line(value: string): void { console.log(value); }

  private paint(kind: 'red' | 'green' | 'yellow' | 'cyan' | 'bold' | 'dim', value: string): string {
    if (!this.colors) return value;
    const codes = { red: 31, green: 32, yellow: 33, cyan: 36, bold: 1, dim: 2 } as const;
    return `\u001b[${codes[kind]}m${value}\u001b[0m`;
  }
}
