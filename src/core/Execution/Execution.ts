// Execution.ts
import { randomUUID } from 'node:crypto';

export type ExecutionStatus = 'created' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionEvent {
  timestamp: string;
  type: string;
  data?: unknown;
}

export class Execution {
  public readonly id: string = randomUUID();
  public readonly taskId: string;
  public status: ExecutionStatus = 'created';
  public currentOperation?: string;
  public result?: string;
  public readonly history: ExecutionEvent[] = [];

  public constructor(taskId: string) {
    this.taskId = taskId;
  }

  public addEvent(type: string, data?: unknown): void {
    this.history.push({
      timestamp: new Date().toISOString(),
      type,
      data,
    });
  }
}
