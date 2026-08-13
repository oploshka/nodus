import type { TaskExecutionMetrics } from '@engine/Metrics/TaskExecutionMetrics.js';
import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type EnginePresentationEvent =
  | { type: 'task-start' }
  | { type: 'execution-start' }
  | { type: 'step-start'; position: string; goal: string }
  | { type: 'step-finish'; position: string; status: string }
  | { type: 'task-finish'; status: string; reason?: string; canContinue?: boolean; metrics?: TaskExecutionMetrics };

/** Root runtime presentation. Engine lifecycle stays visually dominant. */
export class EnginePresentation implements Presentation<EnginePresentationEvent> {
  public readonly role = 'Engine';
  public readonly color = 'white' as const;

  public format(event: EnginePresentationEvent, responseLanguage = 'en'): PresentedMessage | undefined {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    if (event.type === 'task-start') return { text: russian ? 'Задача получена' : 'Task received' };
    if (event.type === 'execution-start') return { text: russian ? 'Приступаю к выполнению плана' : 'Starting plan execution' };
    if (event.type === 'step-start') return { text: `${russian ? 'Шаг' : 'Step'} ${event.position}`, details: [event.goal] };
    if (event.type === 'step-finish') {
      if (event.status !== 'completed') return undefined;
      return { text: `${russian ? 'Шаг' : 'Step'} ${event.position}: ${russian ? 'завершён' : 'completed'}` };
    }

    const statusText = event.status === 'completed'
      ? (russian ? 'Задача завершена' : 'Task completed')
      : event.status === 'not-completed'
        ? (russian ? 'Задача не завершена' : 'Task not completed')
        : (russian ? 'Задача завершилась ошибкой' : 'Task failed');
    const metrics = event.metrics;
    const details: string[] = [];
    if (event.reason) details.push(`${russian ? 'Причина' : 'Reason'}: ${event.reason}`);
    if (event.canContinue) details.push(russian ? 'Выполнение можно продолжить.' : 'Execution can continue.');
    if (metrics) {
      details.push(russian
        ? `План: ${metrics.completedSteps}/${metrics.planSteps} шагов завершено`
        : `Plan: ${metrics.completedSteps}/${metrics.planSteps} steps completed`);
      details.push(`Model: ${metrics.modelCalls} ${russian ? 'вызовов' : 'calls'} · ${metrics.promptTokens} → ${metrics.completionTokens} = ${metrics.totalTokens} tok`);
      details.push(russian
        ? `Research: ${metrics.researchRequests} запросов${metrics.researchCacheHits ? ` · кеш: ${metrics.researchCacheHits}` : ''}`
        : `Research: ${metrics.researchRequests} requests${metrics.researchCacheHits ? ` · cache: ${metrics.researchCacheHits}` : ''}`);
      details.push(russian ? `Worker: ${metrics.workerAttempts} попыток` : `Worker: ${metrics.workerAttempts} attempts`);
      details.push(russian ? `Edit: ${metrics.editFiles} файлов · ${metrics.editOperations} операций` : `Edit: ${metrics.editFiles} files · ${metrics.editOperations} operations`);
      const strategies = Object.entries(metrics.strategies).map(([strategy, count]) => `${strategyName(strategy, russian)} ${count}`);
      if (strategies.length) details.push(`${russian ? 'Методы' : 'Methods'}: ${strategies.join(' · ')}`);
    }
    const duration = metrics ? ` · ${formatDuration(metrics.durationMs)}` : '';
    return { text: `${statusText}${duration}`, details };
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function strategyName(strategy: string, russian: boolean): string {
  if (!russian) {
    if (strategy === 'range-replace') return 'precise replacement';
    if (strategy === 'replace') return 'exact replacement';
    if (strategy === 'diff') return 'patch';
    if (strategy === 'edit') return 'full-file edit';
    return strategy;
  }
  if (strategy === 'range-replace') return 'точечная замена';
  if (strategy === 'replace') return 'точная замена';
  if (strategy === 'diff') return 'патч';
  if (strategy === 'edit') return 'полная правка файла';
  return strategy;
}
