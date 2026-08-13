import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type EnginePresentationEvent =
  | { type: 'task-start' }
  | { type: 'step-start'; position: string; goal: string }
  | { type: 'step-finish'; position: string; status: string }
  | { type: 'task-finish'; status: string; reason?: string; canContinue?: boolean };

/** Root runtime presentation. Engine lifecycle stays visually dominant. */
export class EnginePresentation implements Presentation<EnginePresentationEvent> {
  public readonly role = 'Engine';
  public readonly color = 'white' as const;

  public format(event: EnginePresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    if (event.type === 'task-start') return { text: russian ? 'Задача получена' : 'Task received' };
    if (event.type === 'step-start') {
      return {
        text: russian ? `Шаг ${event.position}` : `Step ${event.position}`,
        details: [event.goal],
      };
    }
    if (event.type === 'step-finish') {
      return { text: `${russian ? 'Шаг' : 'Step'} ${event.position}: ${humanStatus(event.status, russian)}` };
    }
    if (event.status === 'completed') return { text: russian ? 'Задача завершена' : 'Task completed' };
    if (event.status === 'not-completed') {
      return {
        text: russian ? 'Задача не завершена' : 'Task not completed',
        details: [
          ...(event.reason ? [`${russian ? 'Причина' : 'Reason'}: ${event.reason}`] : []),
          ...(event.canContinue ? [russian ? 'Выполнение можно продолжить.' : 'Execution can continue.'] : []),
        ],
      };
    }
    return {
      text: russian ? 'Задача завершилась ошибкой' : 'Task failed',
      details: event.reason ? [`${russian ? 'Причина' : 'Reason'}: ${event.reason}`] : undefined,
    };
  }
}

function humanStatus(status: string, russian: boolean): string {
  if (!russian) return status || 'unknown';
  if (status === 'completed') return 'завершено';
  if (status === 'not-completed') return 'не завершено';
  if (status === 'failed') return 'ошибка';
  return status || 'неизвестно';
}
