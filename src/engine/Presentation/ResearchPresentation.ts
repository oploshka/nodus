import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type ResearchPresentationEvent =
  | { type: 'question'; index?: number; max?: number; question?: string; targets?: string[] }
  | { type: 'cache-hit' }
  | { type: 'resolved'; sources: number }
  | { type: 'not-found' };

export class ResearchPresentation implements Presentation<ResearchPresentationEvent> {
  public readonly role = 'Research';
  public readonly color = 'brightMagenta' as const;

  public format(event: ResearchPresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    if (event.type === 'question') {
      const position = event.index ? `${event.index}${event.max ? `/${event.max}` : ''}` : '';
      const details: string[] = [];
      if (event.targets?.length) details.push(event.targets.join(', '));
      if (event.question) details.push(`→ ${event.question}`);
      return {
        text: `${russian ? 'Вопрос' : 'Question'}${position ? ` ${position}` : ''}`,
        details: details.length ? details : undefined,
      };
    }
    if (event.type === 'cache-hit') return { text: russian ? 'Ответ из кеша' : 'Cache hit' };
    if (event.type === 'resolved') return { text: russian ? `Ответ найден · источников: ${event.sources}` : `Resolved · sources: ${event.sources}` };
    return { text: russian ? 'Ответ не найден' : 'Not found' };
  }
}
