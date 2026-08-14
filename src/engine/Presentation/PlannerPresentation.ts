import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type PlannerPresentationEvent =
  | { type: 'start' }
  | { type: 'finish'; steps: ReadonlyArray<{ goal?: string }> };

export class PlannerPresentation implements Presentation<PlannerPresentationEvent> {
  public readonly role = 'Planner';
  public readonly color = 'magenta' as const;

  public format(event: PlannerPresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    if (event.type === 'start') return { text: russian ? 'Строю план' : 'Building plan' };
    return {
      text: russian ? `План получен · ${event.steps.length} шаг(а)` : `Plan received · ${event.steps.length} step(s)`,
      details: event.steps.map((step, index) => `${index + 1}. ${step.goal ?? ''}`),
    };
  }
}
