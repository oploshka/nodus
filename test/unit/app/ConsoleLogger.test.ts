import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleEventSubscriber } from '@app/Logging/Logger.js';
import type { sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';

class TestAction extends StepAction {
  public getId(): string { return 'change-code'; }
  public async run(_step: sEngineSchemaStep, _dependencies: tEngineRunDependencies) {
    return { status: 'SUCCESS' as const };
  }
}

describe('ConsoleEventSubscriber', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders Step metadata and nested model/edit events', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));
    vi.spyOn(console, 'warn').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));

    const consoleEvents = new ConsoleEventSubscriber('ru');
    const step = new TestAction();
    const base = { path: [1, 1, 1] as const, module: 'ActionCodeChange', step };

    consoleEvents.handle({ ...base, event: { type: 'step.start' } });
    consoleEvents.handle({ ...base, event: { type: 'model.start' } });
    consoleEvents.handle({
      ...base,
      event: {
        type: 'model.finish',
        data: { meta: { durationMs: 1250, promptTokens: 30, completionTokens: 12, totalTokens: 42 } },
      },
    });
    consoleEvents.handle({ ...base, event: { type: 'edit.prepare.start', data: { edits: 1 } } });
    consoleEvents.handle({ ...base, event: { type: 'edit.file.start', data: { path: 'src/a.ts' } } });
    consoleEvents.handle({ ...base, event: { type: 'edit.strategy.retry', level: 'warning', data: { editAttempt: 1 } } });
    consoleEvents.handle({ ...base, event: { type: 'edit.file.finish', data: { operations: 2 } } });

    const output = lines.join('\n');
    expect(output).toContain('[Action] change-code');
    expect(output).toContain('[Model] Обрабатываю...');
    expect(output).toContain('[Model] Ответ получен · 30 → 12 = 42 tok · 1.3s');
    expect(output).toContain('[Edit] Подготавливаю набор изменений · файлов: 1');
    expect(output).toContain('src/a.ts');
    expect(output).toContain('⚠ Замена не применена · уточняю · попытка 1');
    expect(output).toContain('✓ Подготовлено · 2 операций');
  });

  it('does not present a Step FAILURE result as a terminal console error', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));
    vi.spyOn(console, 'error').mockImplementation((value?: unknown) => lines.push(String(value ?? '')));

    const consoleEvents = new ConsoleEventSubscriber('ru');
    const step = new TestAction();
    const base = { path: [1, 1, 1] as const, module: 'ActionCodeChange', step };

    consoleEvents.handle({ ...base, event: { type: 'step.start' } });
    consoleEvents.handle({
      ...base,
      event: {
        type: 'step.finish',
        data: { status: 'FAILURE', reason: 'Additional project context is required.' },
      },
    });

    expect(lines.join('\n')).toContain('[Action] change-code');
    expect(lines.join('\n')).not.toContain('Additional project context is required.');
    expect(lines.join('\n')).not.toContain('✗');
  });
});
