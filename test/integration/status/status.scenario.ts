import { fileURLToPath } from 'node:url';
import { scenario } from '@test-framework/Scenario.js';

export const statusScenario = scenario({
  id: 'todo-priority',
  fixtureRoot: fileURLToPath(new URL('../../../target/project', import.meta.url)),
  task: 'Add low, normal, and high priority to todos, default new todos to normal priority, and display priority in formatTodo.',
  runtime: { maxWorkerAttempts: 4, maxResearchRequests: 1 },
  modelResponses: [
    JSON.stringify({ steps: [{ goal: 'Add todo priority with a normal default and render it.', constraints: ['Preserve existing todo behavior.'], decompositionType: 'coherent-outcome' }] }),
    JSON.stringify({ optionId: 'code' }),
    JSON.stringify({ outcome: 'missing-information', questions: ['Which files define todo creation and formatting?'] }),
    'Todo is defined in src/Todo.ts, created by TodoService.create, persisted by TodoStore.add, and rendered by src/formatTodo.ts.',
    JSON.stringify({ outcome: 'ready', summary: 'Extend the model, creation path, and formatter.', edits: [
      { path: 'src/Todo.ts', instruction: 'Add TodoPriority and a priority field to Todo and CreateTodoInput.' },
      { path: 'src/TodoService.ts', instruction: 'Accept an optional priority and default it to normal when adding a todo.' },
      { path: 'src/formatTodo.ts', instruction: 'Include todo priority in the formatted output.' },
    ] }),
    JSON.stringify({ path: 'src/Todo.ts', operations: [{ startLine: 1, endLine: 12, expected: "export type TodoStatus = 'open' | 'completed';\n\nexport interface Todo {\n  id: number;\n  title: string;\n  status: TodoStatus;\n  createdAt: string;\n}\n\nexport interface CreateTodoInput {\n  title: string;\n}", replacement: "export type TodoStatus = 'open' | 'completed';\nexport type TodoPriority = 'low' | 'normal' | 'high';\n\nexport interface Todo {\n  id: number;\n  title: string;\n  priority: TodoPriority;\n  status: TodoStatus;\n  createdAt: string;\n}\n\nexport interface CreateTodoInput {\n  title: string;\n  priority: TodoPriority;\n}" }] }),
    JSON.stringify({ path: 'src/TodoService.ts', operations: [{ startLine: 1, endLine: 1, expected: "import type { Todo } from './Todo.js';", replacement: "import type { Todo, TodoPriority } from './Todo.js';" }, { startLine: 7, endLine: 11, expected: "  public create(title: string): Todo {\n    const normalized = title.trim();\n    if (!normalized) throw new Error('Todo title is required');\n    return this.store.add({ title: normalized });\n  }", replacement: "  public create(title: string, priority: TodoPriority = 'normal'): Todo {\n    const normalized = title.trim();\n    if (!normalized) throw new Error('Todo title is required');\n    return this.store.add({ title: normalized, priority });\n  }" }] }),
    JSON.stringify({ path: 'src/formatTodo.ts', operations: [{ startLine: 3, endLine: 6, expected: "export function formatTodo(todo: Todo): string {\n  const marker = todo.status === 'completed' ? 'x' : ' ';\n  return `[${marker}] ${todo.id}. ${todo.title}`;\n}", replacement: "export function formatTodo(todo: Todo): string {\n  const marker = todo.status === 'completed' ? 'x' : ' ';\n  return `[${marker}] [${todo.priority}] ${todo.id}. ${todo.title}`;\n}" }] }),
  ],
});
