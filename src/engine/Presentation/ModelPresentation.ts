import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export interface ModelPresentationMeta {
  durationMs?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
}

export type ModelPresentationEvent = { type: 'start' } | { type: 'finish'; meta?: ModelPresentationMeta };

export class ModelPresentation implements Presentation<ModelPresentationEvent> {
  public readonly role = 'Model';
  public readonly color = 'blue' as const;

  public format(event: ModelPresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const russian = responseLanguage.toLowerCase().startsWith('ru');
    if (event.type === 'start') return { text: russian ? 'Обрабатываю...' : 'Processing...' };
    const meta = event.meta ?? {};
    const parts: string[] = [];
    if (typeof meta.durationMs === 'number') parts.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
    if (typeof meta.totalTokens === 'number') parts.push(`${meta.totalTokens} tok`);
    if (typeof meta.promptTokens === 'number' || typeof meta.completionTokens === 'number') parts.push(`${meta.promptTokens ?? '?'}→${meta.completionTokens ?? '?'}`);
    if (meta.finishReason && meta.finishReason !== 'stop') parts.push(meta.finishReason);
    return { text: `${russian ? 'Ответ получен' : 'Response received'}${parts.length ? ` · ${parts.join(' · ')}` : ''}` };
  }
}
