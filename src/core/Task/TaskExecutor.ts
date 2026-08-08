// TaskExecutor.ts
import type { AgentRuntime } from '@agent/Runtime/AgentRuntime';
import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution } from '@core/Execution/Execution';
import type { CreateTaskInput } from '@core/Task/Task';

import { Task } from '@core/Task/Task';

export class TaskExecutor {
  public constructor(private readonly agentRuntime: AgentRuntime) {}

  public async execute(input: CreateTaskInput): Promise<Execution> {
    const task = new Task(input);
    const conversation = this.resolveConversation(input.conversationId);
    return this.agentRuntime.execute(task, conversation);
  }

  private resolveConversation(conversationId: string): Conversation {
    // In the current architecture, conversations are managed by Nodus.
    // TaskExecutor expects a Conversation instance; Nodus will provide it.
    // This method is a placeholder to keep TaskExecutor self-contained.
    throw new Error('Conversation must be provided by the caller (Nodus).');
  }
}
