// Execution.ts
import { randomUUID } from 'node:crypto';
import type { ToolCallRequest } from '@model/Result/OperationResult';
import type { ToolResult } from '@tool/Tool/Tool';

export type ExecutionStatus = 'created' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionEvent {
  timestamp: string;
  type: string;
  data?: unknown;
}

export interface ToolContextEntry {
  call: ToolCallRequest;
  result: ToolResult;
}

export class Execution {
  public readonly id: string = randomUUID();
  public readonly taskId: string;
  public status: ExecutionStatus = 'created';
  public currentOperation?: string;
  public currentStep: number = 0;
  public result?: string;
  public readonly history: ExecutionEvent[] = [];

  private toolContext: ToolContextEntry[] = [];
  private toolContextUsesRemaining: number = 0;

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

  public setToolContext(entries: ToolContextEntry[], uses: number = 2): void {
    this.toolContext = entries;
    this.toolContextUsesRemaining = entries.length > 0 ? uses : 0;
  }

  public getToolContext(): ToolContextEntry[] {
    return this.toolContextUsesRemaining > 0 ? this.toolContext : [];
  }

  public consumeToolContext(): void {
    if (this.toolContextUsesRemaining <= 0) {
      return;
    }

    this.toolContextUsesRemaining -= 1;
    if (this.toolContextUsesRemaining === 0) {
      this.toolContext = [];
    }
  }
}
