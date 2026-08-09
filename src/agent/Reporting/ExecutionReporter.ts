// ExecutionReporter.ts
import type { ConsoleMode } from '@core/Configuration/Configuration';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import type { StepResult } from '@model/Result/OperationResult';

export class ExecutionReporter {
  private activePlanStep?: string;
  private activeAttempt = 1;

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


  public planStep(index: number, total: number, goal: string, type: string, attempt: number, maxAttempts: number, retryReason?: string): void {
    this.activePlanStep = String(index + 1);
    this.activeAttempt = attempt;
    if (this.mode === 'quiet') return;

    if (attempt === 1) {
      this.line(`
${this.paint('cyan', `→ ${index + 1}/${total} ${this.operationName(type)}`)}`);
      this.line(this.paint('dim', `  ${goal}`));
      this.line(this.paint('dim', `  ${index + 1}.1 Выполнение · попытка 1/${maxAttempts}`));
      return;
    }

    this.line(`
${this.paint('yellow', `↻ ${index + 1}.${attempt} Повтор ${this.operationName(type)} · попытка ${attempt}/${maxAttempts}`)}`);
    if (retryReason?.trim()) this.line(this.paint('dim', `  Причина: ${retryReason.trim()}`));
  }

  public stepAlreadySatisfiedAt(index: number, total: number, goal: string, type: string, outputs: string[]): void {
    this.activePlanStep = String(index + 1);
    this.activeAttempt = 0;
    if (this.mode === 'quiet') return;
    this.line(`
${this.paint('cyan', `→ ${index + 1}/${total} ${this.operationName(type)}`)}`);
    this.line(this.paint('dim', `  ${goal}`));
    const suffix = outputs.length > 0 ? `: ${outputs.join(', ')}` : '';
    this.line(this.paint('green', `  ✓ Результат уже известен${suffix}`));
    this.line(this.paint('dim', '    Пропускаю вызов модели: postcondition шага уже выполнен.'));
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

  public modelRequest(operation: string): void {
    if (this.mode === 'quiet') return;
    this.line(this.paint('dim', `    → модель (${this.operationName(operation)})...`));
  }

  public modelResponse(operation: string, durationMs: number, promptTokens?: number, completionTokens?: number): void {
    if (this.mode === 'quiet') return;
    const tokens = this.mode === 'verbose' && promptTokens !== undefined
      ? ` · ${promptTokens} → ${completionTokens ?? 0} токенов`
      : '';
    this.line(this.paint('dim', `    ✓ ответ модели (${operation}) за ${(durationMs / 1000).toFixed(1)} сек${tokens}`));
  }


  public contextCompose(inputs: string[], found: string[], missing: string[]): void {
    if (this.mode === 'quiet' || inputs.length === 0) return;
    this.line(this.paint('dim', `    · контекст: ${inputs.join(', ')}`));
    if (missing.length === 0) {
      this.line(this.paint('dim', `    ✓ входы готовы ${found.length}/${inputs.length}`));
    } else {
      this.line(this.paint('yellow', `    ! не хватает: ${missing.join(', ')}`));
    }
  }

  public stepAlreadySatisfied(outputs: string[]): void {
    if (this.mode === 'quiet') return;
    const suffix = outputs.length > 0 ? `: ${outputs.join(', ')}` : '';
    this.line(this.paint('green', `  ✓ Результат уже известен${suffix}`));
    this.line(this.paint('dim', '    Пропускаю вызов модели: postcondition шага уже выполнен.'));
  }

  public factsMerged(keys: string[]): void {
    if (this.mode === 'quiet' || keys.length === 0) return;
    this.line(this.paint('dim', `    · факты объединены: ${keys.join(', ')}`));
  }

  public protocolRetry(operation: string, truncated: boolean): void {
    if (this.mode === 'quiet') return;
    const reason = truncated ? 'ответ достиг лимита токенов' : 'ответ модели содержит некорректный JSON';
    this.line(this.paint('yellow', `  ! ${reason}`));
    this.line(this.paint('dim', `  → Повторяю ${this.operationName(operation)} в компактном формате`));
  }

  public protocolRepaired(operation: string, durationMs: number): void {
    if (this.mode === 'quiet') return;
    this.line(this.paint('dim', `  ✓ Протокол восстановлен (${this.operationName(operation)}) за ${(durationMs / 1000).toFixed(1)} сек`));
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
    const prefix = result.goalSatisfied ? this.paint('green', '    ✓ результат шага') : this.paint('yellow', '    · промежуточный результат');
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


  public recovery(stepIndex: number, stepGoal: string, reason: string): void {
    if (this.mode === 'quiet') return;
    this.activePlanStep = String(stepIndex + 1);
    this.line(`
${this.paint('yellow', `↻ Восстановление шага ${stepIndex + 1}`)}`);
    this.line(`  ${stepGoal}`);
    this.line(this.paint('yellow', `  Причина: ${reason}`));
  }

  public semanticCheck(goal: string, factKeys: string[], recoveryBranch = false): void {
    if (this.mode === 'quiet') return;
    const prefix = recoveryBranch ? '  ↻' : '    ·';
    this.line(this.paint('dim', `${prefix} проверяю, достаточно ли уже найденных данных (${factKeys.join(', ')})`));
    if (this.mode === 'verbose') this.line(this.paint('dim', `      цель: ${goal}`));
  }

  public semanticCheckResult(satisfied: boolean, reason: string, missing: string[], durationMs: number, recoveryBranch = false): void {
    if (this.mode === 'quiet') return;
    if (satisfied) {
      this.line(this.paint('green', `    ✓ известных данных достаточно · ${(durationMs / 1000).toFixed(1)} сек`));
      this.line(this.paint('dim', `      ${reason}`));
      return;
    }
    const detail = missing.length > 0 ? ` · не хватает: ${missing.slice(0, 2).join('; ')}` : '';
    const prefix = recoveryBranch ? '  ·' : '    ·';
    this.line(this.paint('dim', `${prefix} нужны дополнительные данные · ${(durationMs / 1000).toFixed(1)} сек${detail}`));
  }

  public recoveryPruned(parentGoal: string, count: number, outputs: string[]): void {
    if (this.mode === 'quiet' || count <= 0) return;
    this.line(this.paint('green', `  ✓ Recovery-ветка сокращена: пропущено шагов ${count}`));
    this.line(this.paint('dim', `    Цель уже закрыта: ${parentGoal}`));
    if (outputs.length > 0) this.line(this.paint('dim', `    postcondition: ${outputs.join(', ')}`));
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

  private substep(suffix: string): string {
    return this.activePlanStep ? `${this.activePlanStep}.${suffix}` : suffix;
  }

  private line(value: string): void { console.log(value); }

  private paint(kind: 'red' | 'green' | 'yellow' | 'cyan' | 'bold' | 'dim', value: string): string {
    if (!this.colors) return value;
    const codes = { red: 31, green: 32, yellow: 33, cyan: 36, bold: 1, dim: 2 } as const;
    return `\u001b[${codes[kind]}m${value}\u001b[0m`;
  }
}
