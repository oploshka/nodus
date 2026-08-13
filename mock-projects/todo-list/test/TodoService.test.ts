import assert from 'node:assert/strict';
import test from 'node:test';
import { TodoService } from '../src/TodoService.js';
import { TodoStore } from '../src/TodoStore.js';

test('creates and completes todos', () => {
  const service = new TodoService(new TodoStore());
  const created = service.create('  write tests  ');

  assert.equal(created.title, 'write tests');
  assert.equal(created.status, 'open');

  const completed = service.complete(created.id);
  assert.equal(completed.status, 'completed');
});

test('rejects blank titles', () => {
  const service = new TodoService(new TodoStore());
  assert.throws(() => service.create('   '), /Todo title is required/);
});
