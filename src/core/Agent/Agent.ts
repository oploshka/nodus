// Agent.ts

import type { ContextBuilder } from '@core/Context/ContextBuilder';
import type { Execution } from '@core/Execution/Execution';
import type { ExecutionResult } from '@core/Execution/ExecutionResult';
import type { MemoryStore } from '@core/Memory/MemoryStore';
import type { Task } from '@core/Task/Task';
import type { Model } from '@model/Model';
import type { ToolRegistry } from '@tool/ToolRegistry';

export class Agent {
  constructor(
    private readonly model: Model,
    private readonly tools: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly memory: MemoryStore,
  ) {}

  async execute(task: Task): Promise<ExecutionResult> {
    const execution: Execution = {
      task,
      context: this.contextBuilder
        .addTask(task)
        .build(),
      step: 0,
      completed: false,
    };

    while (!execution.completed) {
      execution.step += 1;

      const response = await this.model.adapter.send(
        execution.context,
      );

      if (response.type === 'message') {
        execution.completed = true;

        this.memory.update({
          completedSteps: [
            ...this.memory.get().completedSteps,
            response.content,
          ],
        });

        return {
          content: response.content ?? '',
          steps: execution.step,
        };
      }

      if (!response.tool) {
        throw new Error('Tool response does not contain a tool call');
      }

      const tool = this.tools.get(response.tool.name);

      if (!tool) {
        throw new Error(`Unknown tool: ${response.tool.name}`);
      }

      const result = await tool.execute(response.tool.input);

      execution.context = this.contextBuilder
        .addToolResult(
          response.tool.name,
          response.tool.input,
          result,
        )
        .build();

      this.memory.update({
        lastFilesModified: [],
      });

      if (execution.step >= 10) {
        throw new Error('Agent execution limit reached');
      }
    }

    throw new Error('Execution ended without a result');
  }
}