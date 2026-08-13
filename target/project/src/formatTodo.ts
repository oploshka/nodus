import type { Todo } from './Todo.js';

export function formatTodo(todo: Todo): string {
  const marker = todo.status === 'completed' ? 'x' : ' ';
  return `[${marker}] ${todo.id}. ${todo.title}`;
}
