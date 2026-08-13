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
  it('keeps worker identity and formatting together', () => {
    const presentation = new WorkerPresentation({ name: { en: 'Code' } });
    expect(presentation.role).toBe('Worker');
    expect(presentation.color).toBe('yellow');
    expect(presentation.format({ type: 'start' }, 'ru')).toEqual({ text: 'Code' });
  });

  it('formats one semantic action with an implementation detail', () => {
    const presentation = new ActionPresentation({
      name: { en: 'Code change', ru: 'Изменение кода' },
      detail: 'range-replace',
    });

    expect(presentation.format({ type: 'start', attempt: 2 }, 'ru')).toEqual({
      text: 'Изменение кода · попытка 2 · метод: range-replace',
    });
    expect(presentation.detail()).toBe('range-replace');
  });

  it('formats Engine lifecycle without requiring ConsoleLogger knowledge', () => {
    const presentation = new EnginePresentation();
    expect(presentation.format({ type: 'step-start', position: '1/2', goal: 'Do work' }, 'ru')).toEqual({
      text: 'Шаг 1/2',
      details: ['Do work'],
    });
  });

  it('keeps Planner, Determine, Research, Edit and Model presentation independent', () => {
    expect(new PlannerPresentation().format({ type: 'start' }, 'ru').text).toBe('Строю план');
    expect(new DeterminePresentation().format({ type: 'finish', workerName: 'Code' }, 'ru').text).toBe('Исполнитель выбран: Code');
    expect(new ResearchPresentation().format({ type: 'resolved', sources: 3 }, 'ru').text).toBe('Ответ найден · источников: 3');
    expect(new EditPresentation().format({ type: 'commit-finish', files: 2 }, 'ru').text).toBe('Change-set применён · файлов: 2');
    expect(new ModelPresentation().format({ type: 'finish', meta: { durationMs: 2200, totalTokens: 120, promptTokens: 100, completionTokens: 20 } }, 'ru').text)
      .toBe('Ответ получен · 2.2s · 120 tok · 100→20');
  });

});

// Each runtime role owns its own independent presentation behavior. The shared
// interface is a renderer contract, not a semantic inheritance hierarchy.
