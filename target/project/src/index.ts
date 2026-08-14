import { formatTodo } from './formatTodo.js';
import { TodoService } from './TodoService.js';
import { TodoStore } from './TodoStore.js';

const service = new TodoService(new TodoStore());
service.create('Try Nodus on a disposable project');
service.create('Inspect the generated edit before committing');
service.complete(1);

for (const todo of service.list()) {
  console.log(formatTodo(todo));
}
