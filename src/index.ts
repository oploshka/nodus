import { Agent } from '@core/Agent/Agent';
import type { Task } from '@core/Task/Task';
import type { Context } from '@core/Context/Context';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import { ToolRegistry } from '@tool/ToolRegistry';

const model: ModelAdapter = {
  async send(prompt: string): Promise<string> {
    console.log(prompt);

    return 'Model response';
  }
};

const tools = new ToolRegistry();

const agent = new Agent(model, tools);

const task: Task = {
  id: '1',
  description: 'Analyze the project',
  status: 'pending'
};

const context: Context = {
  task: task.description,
  files: []
};

const result = await agent.execute(task, context);

console.log(result);