import type { CreateTodoInput, Todo } from './Todo.js';

export class TodoStore {
  private readonly todos: Todo[] = [];
  private nextId = 1;

  public add(input: CreateTodoInput): Todo {
    const todo: Todo = {
      id: this.nextId++,
      title: input.title,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.todos.push(todo);
    return todo;
  }

  public list(): Todo[] {
    return this.todos.map((todo) => ({ ...todo }));
  }

  public complete(id: number): Todo | undefined {
    const todo = this.todos.find((candidate) => candidate.id === id);
    if (!todo) return undefined;
    todo.status = 'completed';
    return { ...todo };
  }
}
