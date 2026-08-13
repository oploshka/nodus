import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from '@app/Logging/Logger.js';
import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import { EnginePresentation } from '@engine/Presentation/EnginePresentation.js';
import { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import { PlannerPresentation } from '@engine/Presentation/PlannerPresentation.js';
import { DeterminePresentation } from '@engine/Presentation/DeterminePresentation.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';
import { ModelPresentation } from '@engine/Presentation/ModelPresentation.js';

describe('ConsoleLogger orchestration output', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows nested semantic ownership, readable names and model token breakdown', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));
    const logger = new ConsoleLogger('ru');
    const enginePresentation = new EnginePresentation();
    const workerPresentation = new WorkerPresentation({ name: { en: 'Code' } });
    const plannerPresentation = new PlannerPresentation();
    const determinePresentation = new DeterminePresentation();
    const modelPresentation = new ModelPresentation();
    const actionPresentation = new ActionPresentation({ name: { en: 'Code change', ru: 'Изменение кода' }, detail: 'range-replace' });

    logger.info('engine.task.start', { taskId: 'task-1', description: 'secret task text', presentation: enginePresentation });
    logger.info('planner.plan.start', { taskId: 'task-1', presentation: plannerPresentation });
    logger.info('model.run.start', { kind: 'model', message: 'Split this user request...', presentation: modelPresentation });
    logger.info('model.run', {
      data: { steps: [{ goal: 'Do work' }] },
      meta: { durationMs: 1250, promptTokens: 30, completionTokens: 12, totalTokens: 42, finishReason: 'stop' }, presentation: modelPresentation,
    });
    logger.info('engine.plan', { taskId: 'task-1', steps: [{ id: 'step-1', goal: 'Do work' }], presentation: plannerPresentation });
    logger.info('engine.step.start', { taskId: 'task-1', step: { id: 'step-1', goal: 'Do work' }, presentation: enginePresentation });
    logger.info('determine.start', { options: 2, presentation: determinePresentation });
    logger.info('model.run.start', { kind: 'model', message: 'Determine the best available option...', presentation: modelPresentation });
    logger.info('model.run', {
      data: { optionId: 'code' },
      meta: { durationMs: 500, promptTokens: 10, completionTokens: 2, totalTokens: 12, finishReason: 'stop' }, presentation: modelPresentation,
    });
    logger.info('determine.finish', { optionId: 'code', workerName: 'Code', presentation: determinePresentation });
    logger.info('worker.start', { workerId: 'code', workerName: 'Code', presentation: workerPresentation, knownAnswers: 0 });
    logger.info('worker.action.start', {
      workerId: 'code', actionId: 'change-code-range-replace', actionName: 'Code change', actionMethod: 'range-replace', actionPresentation, attempt: 1,
    });
    logger.info('model.run.start', { kind: 'model', message: 'Attempt...', presentation: modelPresentation });
    logger.info('model.run', {
      meta: { durationMs: 2500, promptTokens: 100, completionTokens: 20, totalTokens: 120, finishReason: 'length' }, presentation: modelPresentation,
    });

    const output = lines.join('\n');
    expect(output).toContain('[Engine] Задача получена');
    expect(output).not.toContain('secret task text');
    expect(output).toContain('  [Planner] Строю план');
    expect(output).toContain('    [Model] Обрабатываю...');
    expect(output).toContain('    [Model] Ответ получен · 1.3s · 30 → 12 = 42 tok');
    expect(output).toContain('  [Planner] План получен · 1 шаг(а)');
    expect(output).toContain('[Engine] Шаг 1/1\n  Do work');
    expect(output).toContain('  [Determine] Выбираю исполнителя');
    expect(output).toContain('  [Determine] Исполнитель выбран: Code');
    expect(output).toContain('  [Worker] Code');
    expect(output).toContain('    [Action] Изменение кода · попытка 1 · метод: range-replace');
    expect(output).toContain('      [Model] Ответ получен · 2.5s · 100 → 20 = 120 tok · length');
    expect(output).not.toContain('Split this user request');
    expect(output).not.toContain('change-code-range-replace');
  });

  it('renders research as a domain block instead of an Action research duplicate', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));
    const logger = new ConsoleLogger('ru');
    const researchPresentation = new ResearchPresentation();
    const modelPresentation = new ModelPresentation();

    logger.info('worker.action.start', {
      workerId: 'code', actionId: 'research', actionName: 'Research', actionPresentation: researchPresentation, requestIndex: 1, maxRequests: 4, question: 'Where is maxPlanSteps defined?', targets: ['src/engine/Planner/ModelPlanner.ts'],
    });
    logger.info('research.miss', { question: 'Where is maxPlanSteps defined?', targets: ['src/engine/Planner/ModelPlanner.ts'], presentation: researchPresentation });
    logger.info('model.run.start', { kind: 'model', presentation: modelPresentation });
    logger.info('model.run', { meta: { durationMs: 1000, promptTokens: 90, completionTokens: 10, totalTokens: 100, finishReason: 'stop' }, presentation: modelPresentation });
    logger.info('research.resolved', { sources: ['a.ts', 'b.ts'], presentation: researchPresentation });
    logger.info('worker.action.finish', { actionId: 'research', result: { status: 'completed' } });

    const output = lines.join('\n');
    expect(output).toContain('    [Research] Вопрос 1/4');
    expect(output).toContain('      src/engine/Planner/ModelPlanner.ts');
    expect(output).toContain('      → Where is maxPlanSteps defined?');
    expect(output).toContain('      [Model] Обрабатываю...');
    expect(output).toContain('    [Research] Ответ найден · источников: 2');
    expect(output).not.toContain('[Action] research');
    expect(output).not.toContain('[Research] Ищу:');
  });
});
