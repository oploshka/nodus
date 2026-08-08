// ExecutionReporter.ts
import type { ConsoleMode } from '@core/Configuration/Configuration';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import type { StepResult } from '@model/Result/OperationResult';

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

  public plan(plan: TaskPlan): void {
    if (this.mode === 'quiet') return;
    this.line(`\n${this.paint('bold', '◆ План')}`);
    plan.steps.forEach((step, index) => {
      this.line(`  ${index + 1}. ${step.goal} ${this.paint('dim', `[${step.type}, max ${step.maxAttempts}]`)}`);
      if (this.mode === 'verbose') {
        if (step.inputs.length > 0) this.line(this.paint('dim', `     in: ${step.inputs.join(', ')}`));
        if (step.outputs.length > 0) this.line(this.paint('dim', `     out: ${step.outputs.join(', ')}`));
      }
    });
  }


  public planStep(index: number, total: number, goal: string, type: string, attempt: number, maxAttempts: number): void {
    if (this.mode === 'quiet') return;
    const retry = attempt > 1 ? this.paint('dim', ` · попытка ${attempt}/${maxAttempts}`) : '';
    this.line(`
${this.paint('cyan', `→ ${index + 1}/${total} ${this.operationName(type)}`)}${retry}`);
    this.line(this.paint('dim', `  ${goal}`));
  }

  public planAdvance(index: number, total: number, goal: string, type: string): void {
    if (this.mode !== 'verbose') return;
    this.line(this.paint('dim', `  ↳ следующий узел ${index + 1}/${total}: ${this.operationName(type)} — ${goal}`));
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


  public stepResult(result: StepResult): void {
    if (this.mode === 'quiet') return;
    const prefix = result.goalSatisfied ? this.paint('green', '✓ Результат шага') : this.paint('yellow', '· Промежуточный результат');
    this.line(prefix);
    const findings = result.findings.slice(0, this.mode === 'verbose' ? 5 : 3);
    for (const finding of findings) this.line(`  ${finding}`);
    if (this.mode === 'verbose') {
      for (const fact of result.facts.slice(0, 5)) this.line(this.paint('dim', `  ⇒ ${fact.key}: ${fact.value}`));
      for (const item of result.evidence.slice(0, 5)) {
        const source = [item.path, item.symbol].filter(Boolean).join(' :: ');
        this.line(this.paint('dim', `  ↳ ${source ? `${source}: ` : ''}${item.fact}`));
      }
    }
    if (result.missing.length > 0) {
      this.line(this.paint('dim', `  Не хватает: ${result.missing.slice(0, 3).join('; ')}`));
    }
  }

  public warning(message: string): void {
    if (this.mode === 'quiet') return;
    this.line(this.paint('yellow', `! ${message}`));
  }


  public recovery(stepGoal: string, reason: string): void {
    if (this.mode === 'quiet') return;
    this.line(`\n${this.paint('yellow', '↻ Восстановление шага')}`);
    this.line(`  ${stepGoal}`);
    if (this.mode === 'verbose') this.line(this.paint('dim', `  Причина: ${reason}`));
  }

  public recoveryDecision(action: string, reason: string): void {
    if (this.mode === 'quiet') return;
    this.line(this.paint('yellow', `  ↳ ${action}: ${reason}`));
  }

  public planUpdated(plan: TaskPlan, startIndex: number, inserted: number): void {
    if (this.mode === 'quiet') return;
    this.line(this.paint('yellow', `◆ План скорректирован: добавлено шагов ${inserted}`));
    plan.steps.slice(startIndex, startIndex + inserted).forEach((step, index) => {
      this.line(`  + ${startIndex + index + 1}. ${step.goal} ${this.paint('dim', `[${step.type}]`)}`);
    });
  }

  public paused(message: string): void {
    this.line(`\n${this.paint('yellow', 'Ⅱ Выполнение приостановлено')}`);
    this.line(message);
    this.line(this.paint('dim', '  Напишите «продолжи» или «продолжи, <подсказка>». Для остановки используйте /stop.'));
  }

  public resumed(resume: number, hint?: string): void {
    if (this.mode === 'quiet') return;
    this.line(`\n${this.paint('cyan', `▶ Продолжаю выполнение (попытка ${resume})`)}`);
    if (hint?.trim()) this.line(this.paint('dim', `  Подсказка: ${hint.trim()}`));
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
      'prepare-change': 'подготовка изменения', 'edit-file': 'редактирование файла',
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
