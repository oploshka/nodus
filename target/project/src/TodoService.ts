import type { Todo } from './Todo.js';
import { TodoStore } from './TodoStore.js';

export class TodoService {
  public constructor(private readonly store: TodoStore) {}

  public create(title: string): Todo {
    const normalized = title.trim();
    if (!normalized) throw new Error('Todo title is required');
    return this.store.add({ title: normalized });
  }

  public list(): Todo[] {
    return this.store.list();
  }

  public complete(id: number): Todo {
    const todo = this.store.complete(id);
    if (!todo) throw new Error(`Todo ${id} was not found`);
    return todo;
  }
}
