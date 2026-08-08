// ContextBuilder.ts

import type { Context } from '@core/Context/Context';
import type { ContextItem } from '@core/Context/ContextItem';
import type { Task } from '@core/Task/Task';

export class ContextBuilder {
  private readonly items: ContextItem[] = [];

  add(item: ContextItem): this {
    this.items.push(item);

    return this;
  }

  addTask(task: Task): this {
    return this.add({
      type: 'task',
      content: task,
    });
  }

  addFile(path: string, content: string): this {
    return this.add({
      type: 'file',
      content: {
        path,
        content,
      },
    });
  }

  addToolResult(
    tool: string,
    input: unknown,
    result: unknown,
  ): this {
    return this.add({
      type: 'tool',
      content: {
        tool,
        input,
        result,
      },
    });
  }

  build(): Context {
    return {
      items: [...this.items],
    };
  }
}