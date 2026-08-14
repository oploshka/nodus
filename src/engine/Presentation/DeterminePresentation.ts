import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type DeterminePresentationEvent =
  | { type: 'start' }
  | { type: 'finish'; workerName: string };

export class DeterminePresentation implements Presentation<DeterminePresentationEvent> {
  public readonly role = 'Determine';
  public readonly color = 'cyan' as const;

  public format(event: DeterminePresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    if (event.type === 'start') return { text: russian ? 'Выбираю исполнителя' : 'Selecting worker' };
    return { text: russian ? `Исполнитель выбран: ${event.workerName}` : `Worker selected: ${event.workerName}` };
  }
}
