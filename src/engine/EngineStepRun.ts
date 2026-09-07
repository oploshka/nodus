import type { EnginePoint } from './EnginePoint.js';
import type { tEngineStepContext } from './EngineStepContext.js';
import type { iEngineStep } from './EngineStepInterface.js';

export type tEngineStepRunStatus = 'running' | 'completed' | 'failed';

export interface sEngineStepRunParent {
  runId: string;
  point: EnginePoint;
}

/** Public state of one concrete Step execution. */
export interface EngineStepRun {
  readonly id: string;
  readonly step: iEngineStep;
  readonly input: unknown;
  readonly context: tEngineStepContext;
  readonly parent?: sEngineStepRunParent;
  status: tEngineStepRunStatus;
  result?: unknown;
  error?: unknown;
}
