// ContextBuilder.ts

import type { Context } from '@core/Context/Context';
import type { ContextItem } from '@core/Context/ContextItem';
import type { ProjectIndex } from '@knowledge/Index/ProjectIndex';
import type { RagResult } from '@knowledge/Rag/RagResult';
import type { Plan } from '@core/Planning/Plan';
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

  addProject(index: ProjectIndex): this {
    return this.add({
      type: 'knowledge',
      content: index,
    });
  }

  addSearchResults(results: RagResult[]): this {
    return this.add({
      type: 'knowledge',
      content: results,
    });
  }

  addPlan(plan: Plan): this {
    return this.add({
      type: 'message',
      content: plan,
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