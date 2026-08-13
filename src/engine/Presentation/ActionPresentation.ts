import {
  localized,
  type LocalizedText,
  type Presentation,
  type PresentationColor,
  type PresentedMessage,
} from '@engine/Presentation/Presentation.js';

export type ActionPresentationEvent =
  | { type: 'start'; attempt?: number }
  | { type: 'finish'; attempt?: number; status: string; requests?: number }
  | { type: 'error'; attempt?: number; error: string };

export interface ActionPresentationData {
  name: LocalizedText;
  /** Optional implementation detail shown after the semantic action name. */
  detail?: string;
  color?: PresentationColor;
}

/** Reusable presentation for concrete WorkerAction implementations. */
export class ActionPresentation implements Presentation<ActionPresentationEvent> {
  public readonly role = 'Action';
  public readonly color: PresentationColor;

  public constructor(private readonly data: ActionPresentationData) {
    this.color = data.color ?? 'green';
  }

  public name(responseLanguage = 'en'): string {
    return localized(this.data.name, responseLanguage);
  }

  public detail(): string | undefined {
    return this.data.detail;
  }

  public format(event: ActionPresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    const parts = [this.name(responseLanguage)];

    if (event.type === 'start') {
      if (event.attempt) parts.push(russian ? `попытка ${event.attempt}` : `attempt ${event.attempt}`);
      if (this.data.detail) parts.push(russian ? `метод: ${this.data.detail}` : `method: ${this.data.detail}`);
      return { text: parts.join(' · ') };
    }

    if (event.type === 'finish') {
      parts.push(humanStatus(event.status, russian));
      if (event.attempt) parts.push(russian ? `попытка ${event.attempt}` : `attempt ${event.attempt}`);
      if (event.requests) parts.push(russian ? `требуется данных: ${event.requests}` : `data requests: ${event.requests}`);
      return { text: parts.join(' · ') };
    }

    parts.push(russian ? 'ошибка' : 'error');
    if (event.attempt) parts.push(russian ? `попытка ${event.attempt}` : `attempt ${event.attempt}`);
    parts.push(event.error);
    return { text: parts.join(' · ') };
  }
}

function humanStatus(status: string, russian: boolean): string {
  if (!russian) return status || 'unknown';
  if (status === 'completed') return 'завершено';
  if (status === 'not-completed') return 'не завершено';
  if (status === 'failed') return 'ошибка';
  return status || 'неизвестно';
}
