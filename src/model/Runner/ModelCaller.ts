import type { ModelRunInput } from '@model/Request/ModelRun.js';
import type { DiffFileRunInput, ModelRunError, ModelRunner, UnifiedDiffModelResponse } from '@model/Runner/ModelRunner.js';
import { ModelPresentation } from '@engine/Presentation/ModelPresentation.js';

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
const modelPresentation = new ModelPresentation();

export interface ModelCallLogger {
  info(event: string, data?: unknown): void;
}

export async function callModel<TOutput extends object>(
  runner: ModelRunner,
  logger: ModelCallLogger,
  input: ModelRunInput<TOutput>,
): Promise<TOutput> {
  logger.info('model.run.start', {
    kind: 'model',
    message: input.request.message,
    responseFormat: input.response.format,
    presentation: modelPresentation,
  });
  try {
    const result = await runner.run<TOutput>(input);
    logger.info('model.run', { ...result, presentation: modelPresentation });
    return result.data;
  } catch (error) {
    logModelFailure(logger, error);
    throw error;
  }
}

export async function callDiffFile(
  runner: ModelRunner,
  logger: ModelCallLogger,
  input: DiffFileRunInput,
): Promise<UnifiedDiffModelResponse> {
  logger.info('model.run.start', {
    kind: 'diff',
    path: input.path,
    message: input.request.message,
    presentation: modelPresentation,
  });
  try {
    const result = await runner.diffFile(input);
    logger.info('model.run', { ...result, presentation: modelPresentation });
    return result.data;
  } catch (error) {
    logModelFailure(logger, error);
    throw error;
  }
}

function logModelFailure(logger: ModelCallLogger, error: unknown): void {
  if (!(error instanceof Error)) return;
  const modelRun = (error as ModelRunError).modelRun;
  if (!modelRun) return;

  logger.info('model.run.error', {
    error: { name: error.name, message: error.message },
    ...modelRun,
    presentation: modelPresentation,
  });
}
