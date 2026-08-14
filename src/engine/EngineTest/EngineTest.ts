import type { Task } from '@engine/Task/Task.js';

export interface EngineTestContext {
  task: Task;
  changedPaths: string[];
}

export type EngineTestResult =
  | { status: 'passed'; tests: EngineTestRunResult[] }
  | { status: 'failed'; reason: string; tests: EngineTestRunResult[] };

export type EngineTestRunResult =
  | { id: string; status: 'passed'; durationMs: number; details?: string[] }
  | { id: string; status: 'skipped'; durationMs: number; reason?: string }
  | { id: string; status: 'failed'; durationMs: number; reason: string; details?: string[] };

/** Project-level test boundary owned by Engine. */
export interface EngineTest {
  run(context: EngineTestContext): Promise<EngineTestResult>;
}
