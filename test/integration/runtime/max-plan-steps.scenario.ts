import { fileURLToPath } from 'node:url';
import { scenario } from '@test-framework/Scenario.js';

export const maxPlanStepsScenario = scenario({
  id: 'todo-title-limit',
  fixtureRoot: fileURLToPath(new URL('../../../target/project', import.meta.url)),
  task: 'Limit todo titles to 80 characters and add a regression test while preserving trimming and blank-title validation.',
  runtime: { maxWorkerAttempts: 3, maxResearchRequests: 1 },
  modelResponses: [
    JSON.stringify({ steps: [{ goal: 'Enforce an 80-character todo title limit and cover it with a test.', constraints: ['Preserve trimming and blank-title validation.'], decompositionType: 'coherent-outcome' }] }),
    JSON.stringify({ optionId: 'code' }),
    JSON.stringify({ outcome: 'missing-information', questions: ['Where is todo title normalization and validation implemented?'] }),
    'TodoService.create trims and validates titles in src/TodoService.ts; tests are in test/TodoService.test.ts.',
    JSON.stringify({ outcome: 'ready', summary: 'Add the limit at the existing validation boundary and test it.', edits: [
      { path: 'src/TodoService.ts', instruction: 'After blank-title validation, reject normalized titles longer than 80 characters with a clear error.' },
      { path: 'test/TodoService.test.ts', instruction: 'Add a regression test that rejects an 81-character title.' },
    ] }),
    JSON.stringify({ path: 'src/TodoService.ts', operations: [{ startLine: 8, endLine: 10, expected: "    const normalized = title.trim();\n    if (!normalized) throw new Error('Todo title is required');\n    return this.store.add({ title: normalized });", replacement: "    const normalized = title.trim();\n    if (!normalized) throw new Error('Todo title is required');\n    if (normalized.length > 80) throw new Error('Todo title must be 80 characters or fewer');\n    return this.store.add({ title: normalized });" }] }),
    JSON.stringify({ path: 'test/TodoService.test.ts', operations: [{ startLine: 17, endLine: 20, expected: "test('rejects blank titles', () => {\n  const service = new TodoService(new TodoStore());\n  assert.throws(() => service.create('   '), /Todo title is required/);\n});", replacement: "test('rejects blank titles', () => {\n  const service = new TodoService(new TodoStore());\n  assert.throws(() => service.create('   '), /Todo title is required/);\n});\n\ntest('rejects titles longer than 80 characters', () => {\n  const service = new TodoService(new TodoStore());\n  assert.throws(() => service.create('x'.repeat(81)), /80 characters or fewer/);\n});" }] }),
  ],
});
