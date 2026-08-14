import { describe, expect, it } from 'vitest';
import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import { EnginePresentation } from '@engine/Presentation/EnginePresentation.js';
import { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import { PlannerPresentation } from '@engine/Presentation/PlannerPresentation.js';
import { DeterminePresentation } from '@engine/Presentation/DeterminePresentation.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';
import { EditPresentation } from '@engine/Presentation/EditPresentation.js';
import { ModelPresentation } from '@engine/Presentation/ModelPresentation.js';

describe('runtime presentations', () => {
  it('keeps localized worker identity and formatting together', () => {
    const presentation = new WorkerPresentation({ name: { en: 'Development', ru: 'Разработка' } });
    expect(presentation.role).toBe('Worker');
    expect(presentation.color).toBe('yellow');
    expect(presentation.format({ type: 'start' }, 'ru')).toEqual({ text: 'Разработка' });
  });

  it('formats one semantic action with a human implementation detail', () => {
    const presentation = new ActionPresentation({
      name: { en: 'Code change', ru: 'Изменение кода' },
      detail: { en: 'precise replacement', ru: 'точечная замена' },
    });

    expect(presentation.format({ type: 'start', attempt: 2 }, 'ru')).toEqual({
      text: 'Изменение кода · попытка 2 · точечная замена',
    });
    expect(presentation.detail('ru')).toBe('точечная замена');
  });

  it('formats Engine lifecycle without encoding total step count in step identity', () => {
    const presentation = new EnginePresentation();
    expect(presentation.format({ type: 'execution-start' }, 'ru')).toEqual({ text: 'Приступаю к выполнению плана' });
    expect(presentation.format({ type: 'step-start', position: '1', goal: 'Do work' }, 'ru')).toEqual({
      text: 'Шаг 1',
      details: ['Do work'],
    });
  });

  it('keeps Planner, Determine, Research, Edit and Model presentation independent', () => {
    expect(new PlannerPresentation().format({ type: 'start' }, 'ru').text).toBe('Строю план');
    expect(new DeterminePresentation().format({ type: 'finish', workerName: 'Разработка' }, 'ru').text).toBe('Исполнитель выбран: Разработка');
    expect(new ResearchPresentation().format({ type: 'resolved', sources: 3 }, 'ru').text).toBe('Ответ найден · источников: 3');
    expect(new EditPresentation().format({ type: 'commit-finish', files: 2 }, 'ru').text).toBe('Набор изменений применён · файлов: 2');
    expect(new ModelPresentation().format({ type: 'finish', meta: { durationMs: 2200, totalTokens: 120, promptTokens: 100, completionTokens: 20 } }, 'ru').text)
      .toBe('Ответ получен · 100 → 20 = 120 tok · 2.2s');
  });
});
