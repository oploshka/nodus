import { CORE_MODULE_RESULT, type sCoreOutput } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleResult } from '@engine/Core/CoreTsType.js';

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
): tCoreModuleResult {
  return {
    type: CORE_MODULE_RESULT.OUTPUT,
    output: {
      status: result.status === 'completed' ? 'SUCCESS' : 'FAILURE',
      value: result,
      ...(result.status === 'completed' ? {} : { reason: result.reason }),
    },
  };
}

export function readActionCoreResult<TData = unknown, TRequest = unknown>(
  output: sCoreOutput | undefined,
): tActionCoreResult<TData, TRequest> | undefined {
  const value = output?.value;
  if (!value || typeof value !== 'object' || !('status' in value)) return undefined;
  const status = (value as { status?: unknown }).status;
  if (status !== 'completed' && status !== 'not-completed' && status !== 'failed') return undefined;
  return value as tActionCoreResult<TData, TRequest>;
}

export function readActionCoreData<TData>(output: sCoreOutput | undefined): TData | undefined {
  const result = readActionCoreResult<TData>(output);
  return result?.status === 'completed' ? result.data : undefined;
}
