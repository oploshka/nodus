// Agent.ts

import type { Context } from '@core/Context/Context';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ToolRegistry } from '@tool/ToolRegistry';

export class Agent {
  constructor(
    private readonly model: ModelAdapter,
    private readonly tools: ToolRegistry,
  ) {}

  async execute(task: Task, context: Context): Promise<string> {
    let currentContext = context;

    for (let i = 0; i < 10; i += 1) {
      const response = await this.model.send(currentContext);

      if (response.type === 'message') {
        return response.content ?? '';
      }

      if (response.type === 'tool') {
        if (!response.tool) {
          throw new Error('Tool response does not contain a tool call');
        }

        const tool = this.tools.get(response.tool.name);

        if (!tool) {
          throw new Error(`Unknown tool: ${response.tool.name}`);
        }

        const result = await tool.execute(response.tool.input);

        currentContext = {
          ...currentContext,
          files: [
            ...currentContext.files,
            JSON.stringify({
              tool: response.tool.name,
              input: response.tool.input,
              result,
            }),
          ],
        };
      }
    }

    throw new Error('Agent execution limit reached');
  }
}