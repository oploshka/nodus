// Task.ts
import { randomUUID } from 'node:crypto';

export interface TaskOptions {
  initialOperation?: string;
}

export interface CreateTaskInput {
  projectId: string;
  conversationId: string;
  description: string;
  context?: Record<string, unknown>;
  options?: TaskOptions;
}

export class Task {
  public readonly id: string;
  public readonly projectId: string;
  public readonly conversationId: string;
  public readonly description: string;
  public readonly context?: Record<string, unknown>;
  public readonly options?: TaskOptions;
  public readonly createdAt: string;

  public constructor(input: CreateTaskInput) {
    this.id = randomUUID();
    this.projectId = input.projectId;
    this.conversationId = input.conversationId;
    this.description = input.description;
    this.context = input.context;
    this.options = input.options;
    this.createdAt = new Date().toISOString();
  }
}
