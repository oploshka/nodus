import type { tEngineEmit } from '@engine/Core/EngineSchemaTsType.js';
import type { ModelRunInput } from '@model/Request/ModelRun.js';
import type { DiffFileRunInput, ModelRunError, ModelRunner, UnifiedDiffModelResponse } from '@model/Runner/ModelRunner.js';

/**
 * ModelRunner returns the full diagnostic result (`data + exchange + meta`).
 * Steps normally need only `data`, while runtime events keep the diagnostic
 * exchange available to subscribers and the executing schema step.
 */
export async function callModel<TOutput extends object>(
  runner: ModelRunner,
  emit: tEngineEmit,
  input: ModelRunInput<TOutput>,
): Promise<TOutput> {
  emit({
    type: 'model.start',
    data: {
      kind: 'model',
      message: input.request.message,
      responseFormat: input.response.format,
    },
  });
  try {
    const result = await runner.run<TOutput>(input);
    emit({ type: 'model.finish', data: result });
    return result.data;
  } catch (error) {
    emitModelFailure(emit, error);
    throw error;
  }
}

export async function callDiffFile(
  runner: ModelRunner,
  emit: tEngineEmit,
  input: DiffFileRunInput,
): Promise<UnifiedDiffModelResponse> {
  emit({
    type: 'model.start',
    data: {
      kind: 'diff',
      path: input.path,
      message: input.request.message,
    },
  });
  try {
    const result = await runner.diffFile(input);
    emit({ type: 'model.finish', data: result });
    return result.data;
  } catch (error) {
    emitModelFailure(emit, error);
    throw error;
  }
}

function emitModelFailure(emit: tEngineEmit, error: unknown): void {
  if (!(error instanceof Error)) return;
  const modelRun = (error as ModelRunError).modelRun;
  emit({
    type: 'model.error',
    level: 'error',
    data: {
      error: { name: error.name, message: error.message },
      ...(modelRun ?? {}),
    },
  });
}
