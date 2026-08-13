import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from '@app/Logging/Logger.js';
import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import { EnginePresentation } from '@engine/Presentation/EnginePresentation.js';
import { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import { PlannerPresentation } from '@engine/Presentation/PlannerPresentation.js';
import { DeterminePresentation } from '@engine/Presentation/DeterminePresentation.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';
import { ModelPresentation } from '@engine/Presentation/ModelPresentation.js';
import { EditPresentation } from '@engine/Presentation/EditPresentation.js';

describe('ConsoleLogger orchestration output', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows nested semantic ownership, human names, edit details and final metrics', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));
    const logger = new ConsoleLogger('ru');
    const enginePresentation = new EnginePresentation();
    const workerPresentation = new WorkerPresentation({ name: { en: 'Development', ru: 'Разработка' } });
    const plannerPresentation = new PlannerPresentation();
    const determinePresentation = new DeterminePresentation();
    const modelPresentation = new ModelPresentation();
    const editPresentation = new EditPresentation();
    const actionPresentation = new ActionPresentation({
      name: { en: 'Code change', ru: 'Изменение кода' },
      detail: { en: 'precise replacement', ru: 'точечная замена' },
    });

    logger.info('engine.task.start', { taskId: 'task-1', description: 'secret task text', presentation: enginePresentation });
    logger.info('planner.plan.start', { taskId: 'task-1', presentation: plannerPresentation });
    logger.info('model.run.start', { presentation: modelPresentation });
    logger.info('model.run', { meta: { durationMs: 1250, promptTokens: 30, completionTokens: 12, totalTokens: 42, finishReason: 'stop' }, presentation: modelPresentation });
    logger.info('engine.plan', { taskId: 'task-1', steps: [{ id: 'step-1', goal: 'Do work' }], presentation: plannerPresentation });
    logger.info('engine.execution.start', { taskId: 'task-1', presentation: enginePresentation });
    logger.info('engine.step.start', { taskId: 'task-1', step: { id: 'step-1', goal: 'Do work' }, presentation: enginePresentation });
    logger.info('determine.start', { presentation: determinePresentation });
    logger.info('determine.finish', { optionId: 'code', workerName: 'Development', workerPresentation, presentation: determinePresentation });
    logger.info('worker.start', { presentation: workerPresentation, knownAnswers: 0 });
    logger.info('worker.action.start', { actionId: 'change-code', actionPresentation, attempt: 1 });
    logger.info('engine.edit.prepare.start', { files: 1, presentation: editPresentation });
    logger.info('engine.edit.file.start', { path: 'src/a.ts', presentation: editPresentation });
    logger.info('engine.edit.model.model.run.start', { presentation: modelPresentation });
    logger.info('engine.edit.model.model.run', { meta: { durationMs: 2500, promptTokens: 100, completionTokens: 20, totalTokens: 120, finishReason: 'length' }, presentation: modelPresentation });
    logger.info('engine.edit.file.finish', { path: 'src/a.ts', operations: 2, strategy: 'range-replace', presentation: editPresentation });
    logger.info('worker.action.finish', { actionId: 'change-code', actionPresentation, attempt: 1, result: { status: 'completed' } });
    logger.info('engine.step.finish', { taskId: 'task-1', stepId: 'step-1', status: 'completed', presentation: enginePresentation });
    logger.info('engine.task.finish', { taskId: 'task-1', status: 'completed', presentation: enginePresentation });

    const output = lines.join('\n');
    expect(output).toContain('[Engine] Задача получена');
    expect(output).not.toContain('secret task text');
    expect(output).toContain('  [Planner] Строю план');
    expect(output).toContain('    [Model] Ответ получен · 30 → 12 = 42 tok · 1.3s');
    expect(output).toContain('[Engine] Приступаю к выполнению плана');
    expect(output).toContain('[Engine] Шаг 1\n  Do work');
    expect(output).not.toContain('Шаг 1/1');
    expect(output).toContain('  [Determine] Исполнитель выбран: Разработка');
    expect(output).toContain('  [Worker] Разработка');
    expect(output).toContain('    [Action] Изменение кода · попытка 1 · точечная замена');
    expect(output).toContain('  [Edit] Подготавливаю набор изменений · файлов: 1');
    expect(output).toContain('    src/a.ts');
    expect(output).toContain('      [Model] Ответ получен · 100 → 20 = 120 tok · 2.5s · length');
    expect(output).toContain('    ✓ Подготовлено · 2 операций');
    expect(output).toContain('[Engine] Задача завершена');
    expect(output).toContain('Model: 2 вызовов · 130 → 32 = 162 tok');
    expect(output).toContain('Edit: 1 файлов · 2 операций');
    expect(output).toContain('Методы: точечная замена 1');
    expect(output).not.toContain('change-code-range-replace');
  });

  it('renders research as a domain block instead of an Action research duplicate', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));
    const logger = new ConsoleLogger('ru');
    const researchPresentation = new ResearchPresentation();
    const modelPresentation = new ModelPresentation();

    logger.info('worker.action.start', { actionId: 'research', actionPresentation: researchPresentation, requestIndex: 1, maxRequests: 4, question: 'Where is maxPlanSteps defined?' });
    logger.info('research.miss', { presentation: researchPresentation });
    logger.info('model.run.start', { presentation: modelPresentation });
    logger.info('model.run', { meta: { durationMs: 1000, promptTokens: 90, completionTokens: 10, totalTokens: 100 }, presentation: modelPresentation });
    logger.info('research.resolved', { sources: ['a.ts', 'b.ts'], presentation: researchPresentation });
    logger.info('worker.action.finish', { actionId: 'research', result: { status: 'completed' } });

    const output = lines.join('\n');
    expect(output).toContain('    [Research] Вопрос 1/4');
    expect(output).toContain('      Where is maxPlanSteps defined?');
    expect(output).toContain('      [Model] Обрабатываю...');
    expect(output).toContain('    [Research] Ответ найден · источников: 2');
    expect(output).not.toContain('[Action] research');
  });
});
