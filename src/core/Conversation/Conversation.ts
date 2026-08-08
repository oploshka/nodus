// Conversation.ts
import { randomUUID } from 'node:crypto';
import type { Task } from '@core/Task/Task';

export interface ConversationEntry {
  taskId: string;
  description: string;
  result?: string;
  createdAt: string;
}

export class Conversation {
  public readonly id: string;
  public readonly projectId: string;
  private readonly entries: ConversationEntry[] = [];

  public constructor(projectId: string, id: string = randomUUID()) {
    this.projectId = projectId;
    this.id = id;
  }

  public addTask(task: Task): void {
    this.entries.push({
      taskId: task.id,
      description: task.description,
      createdAt: task.createdAt,
    });
  }

  public completeTask(taskId: string, result: string): void {
    const entry = this.entries.find((item) => item.taskId === taskId);
    if (entry) {
      entry.result = result;
    }
  }

  public recent(limit: number): ConversationEntry[] {
    return this.entries.slice(-limit).map((entry) => ({ ...entry }));
  }
}
