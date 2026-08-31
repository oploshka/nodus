import type { sEngineOutput } from '@engine/Core/EngineSchemaTsType.js';

export interface sActionCoreRequest<TInput = unknown> {
  actionId: string;
  input: TInput;
}

export type tActionCoreResult<TData = unknown, TRequest = unknown> =
  | { status: 'completed'; data: TData }
  | {
      status: 'not-completed';
      reason: string;
      canContinue: true;
      requests?: Array<sActionCoreRequest<TRequest>>;
      retry?: boolean;
    }
  | { status: 'failed'; reason: string; canContinue: false };

export function actionCoreResult<TData, TRequest>(
  result: tActionCoreResult<TData, TRequest>,
): sEngineOutput {
  return {
    status: result.status === 'completed' ? 'SUCCESS' : 'FAILURE',
    value: result,
    ...(result.status === 'completed' ? {} : { reason: result.reason }),
  };
}

export function readActionCoreResult<TData = unknown, TRequest = unknown>(
  output: sEngineOutput | undefined,
): tActionCoreResult<TData, TRequest> | undefined {
  const value = output?.value;
  if (!value || typeof value !== 'object' || !('status' in value)) return undefined;
  const status = (value as { status?: unknown }).status;
  if (status !== 'completed' && status !== 'not-completed' && status !== 'failed') return undefined;
  return value as tActionCoreResult<TData, TRequest>;
}

export function readActionCoreData<TData>(output: sEngineOutput | undefined): TData | undefined {
  const result = readActionCoreResult<TData>(output);
  return result?.status === 'completed' ? result.data : undefined;
}
