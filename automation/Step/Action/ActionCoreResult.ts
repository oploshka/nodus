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

/** Keeps Action result creation explicit while returning the value directly to the Point runtime. */
export function actionCoreResult<TData, TRequest>(
  result: tActionCoreResult<TData, TRequest>,
): tActionCoreResult<TData, TRequest> {
  return result;
}

/** Reads both the new direct result and the deprecated EngineOutput wrapper shape. */
export function readActionCoreResult<TData = unknown, TRequest = unknown>(
  output: unknown,
): tActionCoreResult<TData, TRequest> | undefined {
  const direct = readCandidate(output);
  if (direct) return direct as tActionCoreResult<TData, TRequest>;

  if (!isRecord(output)) return undefined;
  return readCandidate(output.value) as tActionCoreResult<TData, TRequest> | undefined;
}

export function readActionCoreData<TData>(output: unknown): TData | undefined {
  const result = readActionCoreResult<TData>(output);
  return result?.status === 'completed' ? result.data : undefined;
}

function readCandidate(value: unknown): tActionCoreResult | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status;
  if (status !== 'completed' && status !== 'not-completed' && status !== 'failed') return undefined;
  return value as tActionCoreResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
