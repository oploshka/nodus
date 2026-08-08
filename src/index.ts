// index.ts

import { Agent } from '@core/Agent/Agent';
import { ContextBuilder } from '@core/Context/ContextBuilder';
import type { Context } from '@core/Context/Context';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { Task } from '@core/Task/Task';
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

let requestCount = 0;

const model: ModelAdapter = {
  async send(context: Context) {
    requestCount += 1;

    console.log(`Model request #${requestCount}`);
    console.log(JSON.stringify(context, null, 2));

    if (requestCount === 1) {
      return {
        type: 'tool',
        tool: {
          name: 'filesystem',
          input: {
            action: 'read',
            path: './package.json',
          },
        },
      };
    }

    return {
      type: 'message',
      content: 'Project analyzed',
    };
  },
};

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