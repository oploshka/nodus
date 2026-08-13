export type TodoStatus = 'open' | 'completed';

export interface Todo {
  id: number;
  title: string;
  status: TodoStatus;
  createdAt: string;
}

export interface CreateTodoInput {
  title: string;
}
