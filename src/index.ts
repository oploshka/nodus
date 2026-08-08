// index.ts

import { Agent } from '@core/Agent/Agent';
import { ContextBuilder } from '@core/Context/ContextBuilder';
import type { Task } from '@core/Task/Task';
import { ModelFactory } from '@model/ModelFactory';
import { MockModelAdapter } from '@model/Adapter/MockModelAdapter';
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

const model = new ModelFactory().create(
  {
    provider: 'mock',
    model: 'mock-model',
  },
  new MockModelAdapter(),
);

const agent = new Agent(
  model,
  tools,
  new ContextBuilder(),
);

const task: Task = {
  id: '1',
  description: 'Analyze the project',
  status: 'pending',
};

console.log(await agent.execute(task));