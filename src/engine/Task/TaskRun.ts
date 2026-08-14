import type { Plan } from '@engine/Planner/Plan.js';
import type { WorkerResult } from '@engine/Worker/Worker.js';
import type { Task } from '@engine/Task/Task.js';

export interface StepRunResult {
  stepId: string;
  workerId: string;
  result: WorkerResult;
}

export type TaskRunStatus = 'completed' | 'not-completed' | 'failed';

export class TaskRun {
  public readonly startedAt = new Date().toISOString();
  public finishedAt?: string;
  public readonly steps: StepRunResult[] = [];

  public constructor(
    public readonly task: Task,
    public readonly plan: Plan,
  ) {}

  public add(stepId: string, workerId: string, result: WorkerResult): void {
    this.steps.push({ stepId, workerId, result });
  }

  public finish(): void { this.finishedAt = new Date().toISOString(); }

  public get status(): TaskRunStatus {
    const last = this.steps.at(-1)?.result.status;
    if (last && last !== 'completed') return last;
    return this.steps.length === this.plan.steps.length ? 'completed' : 'not-completed';
  }
}
