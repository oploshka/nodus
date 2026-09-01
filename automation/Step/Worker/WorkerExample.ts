import { EngineStep } from '@engine/EngineStep.js';

/** Minimal leaf Worker used only to prove nested Planner execution and result passing. */
export class WorkerExample extends EngineStep {
  public getId(): string {
    return 'WorkerExample';
  }

  public getGroup(): string {
    return 'worker';
  }

  public async run(input: unknown): Promise<unknown> {
    const { task, context } = readInput(input);

    if (task === 'Изучи JSON') return { format: 'json', result: 'JSON_RESULT' };
    if (task === 'Изучи YAML') return { format: 'yaml', result: 'YAML_RESULT' };
    if (task === 'Изучи XML') return { format: 'xml', result: 'XML_RESULT' };

    if (task === 'Сравни JSON, YAML и XML') {
      return {
        comparison: true,
        context,
      };
    }

    return { task, context };
  }
}

function readInput(input: unknown): { task: string; context: Readonly<Record<string, unknown>> } {
  if (typeof input === 'string') return { task: input, context: {} };
  if (typeof input !== 'object' || input === null) return { task: '', context: {} };

  const value = input as { task?: unknown; context?: unknown };
  return {
    task: typeof value.task === 'string' ? value.task : '',
    context: isRecord(value.context) ? value.context : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
