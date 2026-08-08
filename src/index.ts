// index.ts

import { Agent } from '@core/Agent/Agent';
import type { Context } from '@core/Context/Context';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import { GitTool } from '@tool/Git/GitTool';
import { TerminalTool } from '@tool/Terminal/TerminalTool';
import { TestingTool } from '@tool/Testing/TestingTool';
import { ToolRegistry } from '@tool/ToolRegistry';

const terminal = new TerminalTool();

const tools = new ToolRegistry();

tools.register(new FileSystemTool());
tools.register(terminal);
tools.register(new GitTool(terminal));
tools.register(new TestingTool(terminal));

const model: ModelAdapter = {
  async send(prompt: string): Promise<string> {
    console.log(prompt);

    return 'Model response';
  },
};

const agent = new Agent(model, tools);

const task: Task = {
  id: '1',
  description: 'Analyze the project',
  status: 'pending',
};

const context: Context = {
  task: task.description,
  files: [],
};

const result = await agent.execute(task, context);

console.log(result);