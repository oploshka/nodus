import type { Plan } from '../planner/Plan.js';
import type { WorkerResult } from '../worker/DefaultWorker.js';
import type { Task } from './Task.js';

export interface StepRunResult {
  stepId: string;
  result: WorkerResult;
}

export class TaskRun {
  public readonly startedAt = new Date().toISOString();
  public finishedAt?: string;
  public readonly steps: StepRunResult[] = [];

  public constructor(
    public readonly task: Task,
    public readonly plan: Plan,
  ) {}

  public add(stepId: string, result: WorkerResult): void { this.steps.push({ stepId, result }); }

  public finish(): void { this.finishedAt = new Date().toISOString(); }

  public get status(): 'completed' | 'failed' {
    return this.steps.some((step) => step.result.status === 'failed') ? 'failed' : 'completed';
  }
}
