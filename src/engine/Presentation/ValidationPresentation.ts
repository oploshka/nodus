import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type ValidationPresentationEvent =
  | { type: 'start' }
  | { type: 'passed' }
  | { type: 'failed'; reason?: string };

export class ValidationPresentation implements Presentation<ValidationPresentationEvent> {
  public readonly role = 'Validation';
  public readonly color = 'brightGreen' as const;

  public format(event: ValidationPresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    if (event.type === 'start') return { text: russian ? 'Проверяю результат' : 'Validating result' };
    if (event.type === 'passed') return { text: russian ? 'Проверка пройдена' : 'Validation passed' };
    return {
      text: russian ? 'Проверка не пройдена' : 'Validation failed',
      details: event.reason ? [event.reason] : undefined,
    };
  }
}
