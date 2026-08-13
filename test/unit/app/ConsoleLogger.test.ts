import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from '@app/Logging/Logger.js';

describe('ConsoleLogger orchestration output', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows semantic ownership without repeating the task or exposing model prompts', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));
    const logger = new ConsoleLogger('ru');

    logger.info('engine.task.start', { taskId: 'task-1', description: 'secret task text' });
    logger.info('planner.plan.start', { taskId: 'task-1' });
    logger.info('model.run.start', { kind: 'model', message: 'Split this user request...' });
    logger.info('model.run', { data: { steps: [{ goal: 'Do work' }] }, meta: { durationMs: 1250, totalTokens: 42 } });
    logger.info('engine.plan', { taskId: 'task-1', steps: [{ id: 'step-1', goal: 'Do work' }] });
    logger.info('determine.start', { options: 2 });
    logger.info('model.run.start', { kind: 'model', message: 'Determine the best available option...' });
    logger.info('model.run', { data: { optionId: 'code' }, meta: { durationMs: 500, totalTokens: 12 } });
    logger.info('determine.finish', { optionId: 'code' });
    logger.info('engine.worker.selected', { workerId: 'code' });

    const output = lines.join('\n');
    expect(output).toContain('[Engine] Задача получена');
    expect(output).not.toContain('secret task text');
    expect(output).toContain('[Planner] Строю план');
    expect(output).toContain('  [Model] Обрабатываю...');
    expect(output).toContain('  [Model] Ответ получен · 1.3s · 42 tok');
    expect(output).toContain('[Planner] План получен · 1 шаг(а)');
    expect(output).toContain('[Determine] Выбираю исполнителя');
    expect(output).toContain('[Determine] Исполнитель выбран: code');
    expect(output).not.toContain('Split this user request');
    expect(output).not.toContain('[Engine] Исполнитель');
  });
});
