import type { ModelRunInput } from '../Request/ModelRun.js';
import type { DiffFileRunInput, ModelRunner, UnifiedDiffModelResponse } from './ModelRunner.js';

/**
 * Minimal logging contract intentionally kept local to this boundary.
 *
 * ModelRunner returns the full diagnostic result (`data + exchange + meta`).
 * Ordinary engine steps normally need only `data`, while logging needs the rest.
 * These functions record the complete result and expose only application data,
 * so diagnostic transport details do not spread through Planner/Research/Worker.
 *
 * This is intentionally a plain function boundary, not a class and not part of
 * ModelRunner's lifecycle. The logger is passed explicitly on purpose; hiding it
 * behind DI would add structure without removing any real responsibility.
 */
export interface ModelCallLogger {
  info(event: string, data?: unknown): void;
}

export async function callModel<TOutput extends object>(
  runner: ModelRunner,
  logger: ModelCallLogger,
  input: ModelRunInput<TOutput>,
): Promise<TOutput> {
  const result = await runner.run<TOutput>(input);
  logger.info('model.run', result);
  return result.data;
}

export async function callDiffFile(
  runner: ModelRunner,
  logger: ModelCallLogger,
  input: DiffFileRunInput,
): Promise<UnifiedDiffModelResponse> {
  const result = await runner.diffFile(input);
  logger.info('model.run', result);
  return result.data;
}
