import type { sEngineOutput } from '@engine/Core/EngineSchemaTsType.js';
import type { ProjectEditRequest } from '@engine/Process/Edit/EditTypes.js';

export type tActionChangeCodeRequest =
  | { actionId: 'find-file'; input: { query: string } }
  | { actionId: 'read-file'; input: { path: string } }
  | { actionId: 'research'; input: { question: string } };

export type tActionChangeCodeResult =
  | { status: 'ready-edit'; summary: string; edit: ProjectEditRequest }
  | { status: 'need-context'; reason: string; requests: tActionChangeCodeRequest[] }
  | { status: 'already-completed'; summary: string }
  | { status: 'retry'; reason: string }
  | { status: 'failed'; reason: string };

export function actionChangeCodeResult(result: tActionChangeCodeResult): sEngineOutput {
  const completed = result.status === 'ready-edit' || result.status === 'already-completed';
  return {
    status: completed ? 'SUCCESS' : 'FAILURE',
    value: result,
    ...(completed ? {} : { reason: result.reason }),
  };
}

export function readActionChangeCodeResult(
  output: sEngineOutput | undefined,
): tActionChangeCodeResult | undefined {
  const value = output?.value;
  if (!value || typeof value !== 'object' || !('status' in value)) return undefined;

  const status = (value as { status?: unknown }).status;
  if (
    status !== 'ready-edit'
    && status !== 'need-context'
    && status !== 'already-completed'
    && status !== 'retry'
    && status !== 'failed'
  ) return undefined;

  return value as tActionChangeCodeResult;
}
