import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export interface ModelPresentationMeta {
  durationMs?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  generationTokensPerSecond?: number;
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
    const hasBreakdown = typeof meta.promptTokens === 'number' || typeof meta.completionTokens === 'number';
    if (hasBreakdown) {
      const input = meta.promptTokens ?? '?';
      const output = meta.completionTokens ?? '?';
      const total = meta.totalTokens ?? (typeof input === 'number' && typeof output === 'number' ? input + output : '?');
      parts.push(`${input} → ${output} = ${total} tok`);
    } else if (typeof meta.totalTokens === 'number') {
      parts.push(`${meta.totalTokens} tok`);
    }
    if (typeof meta.durationMs === 'number') parts.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
    if (typeof meta.generationTokensPerSecond === 'number') parts.push(`${meta.generationTokensPerSecond.toFixed(1)} tok/s`);
    if (meta.finishReason && meta.finishReason !== 'stop') parts.push(meta.finishReason);

    return { text: `${russian ? 'Ответ получен' : 'Response received'}${parts.length ? ` · ${parts.join(' · ')}` : ''}` };
  }
}
