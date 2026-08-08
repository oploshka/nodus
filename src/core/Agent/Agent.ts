import type { Task } from '@core/Task/Task';
import type { Context } from '@core/Context/Context';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ToolRegistry } from '@tool/ToolRegistry';

export class Agent {
  constructor(
    private readonly model: ModelAdapter,
    private readonly tools: ToolRegistry
  ) {}

  async execute(task: Task, context: Context): Promise<string> {
    const response = await this.model.send(
      JSON.stringify({
        task,
        context,
        tools: this.tools.getAll().map((tool) => ({
          name: tool.name,
          description: tool.description
        }))
      })
    );

    return response;
  }
}