import {
  localized,
  type LocalizedText,
  type Presentation,
  type PresentationColor,
  type PresentedMessage,
} from '@engine/Presentation/Presentation.js';

export type WorkerPresentationEvent =
  | { type: 'start'; knownAnswers?: number }
  | { type: 'attempt'; attempt: number; status: string; questions?: string[] }
  | { type: 'attempt-error'; attempt: number; error: string }
  | { type: 'finish'; status: string; rounds?: number };

export interface WorkerPresentationData {
  name: LocalizedText;
  color?: PresentationColor;
}

/** Reusable presentation for concrete Worker implementations. */
export class WorkerPresentation implements Presentation<WorkerPresentationEvent> {
  public readonly role = 'Worker';
  public readonly color: PresentationColor;

  public constructor(private readonly data: WorkerPresentationData) {
    this.color = data.color ?? 'yellow';
  }

  public name(responseLanguage = 'en'): string {
    return localized(this.data.name, responseLanguage);
  }

  public format(event: WorkerPresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    const name = this.name(responseLanguage);

    if (event.type === 'start') {
      const suffix = event.knownAnswers && event.knownAnswers > 0
        ? (russian ? ` · знаний: ${event.knownAnswers}` : ` · known answers: ${event.knownAnswers}`)
        : '';
      return { text: `${name}${suffix}` };
    }

    if (event.type === 'attempt') {
      const status = humanStatus(event.status, russian);
      const questions = event.questions ?? [];
      return {
        text: russian
          ? `${name} · попытка ${event.attempt} · ${status}${questions.length ? ` (${questions.length})` : ''}`
          : `${name} · attempt ${event.attempt} · ${status}${questions.length ? ` (${questions.length})` : ''}`,
        details: questions.map((question) => `- ${question}`),
      };
    }

    if (event.type === 'attempt-error') {
      return {
        text: russian
          ? `${name} · попытка ${event.attempt} · ошибка · ${event.error}`
          : `${name} · attempt ${event.attempt} · error · ${event.error}`,
      };
    }

    const status = humanStatus(event.status, russian);
    const rounds = event.rounds && event.rounds > 0
      ? (russian ? ` · раундов: ${event.rounds}` : ` · rounds: ${event.rounds}`)
      : '';
    return { text: `${name} · ${status}${rounds}` };
  }
}

function humanStatus(status: string, russian: boolean): string {
  if (!russian) return status || 'unknown';
  if (status === 'completed') return 'завершено';
  if (status === 'not-completed') return 'не завершено';
  if (status === 'failed') return 'ошибка';
  return status || 'неизвестно';
}
