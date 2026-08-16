import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectEditor } from '@engine/Edit/ProjectEditor.js';
import type { EditStrategy } from '@engine/Edit/EditStrategy.js';
import { EditValidator } from '@engine/Edit/Validation/EditValidator.js';
import { ProjectFiles } from '@engine/Project/File/ProjectFiles.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { Task } from '@engine/Task/Task.js';
import type { PlanStep } from '@engine/Planner/Plan.js';

const logger: EngineLogger = { info() {}, warn() {}, error() {} };
const roots: string[] = [];
const step: PlanStep = { id: 's1', goal: 'goal', constraints: [], decompositionType: 'coherent-outcome' };

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(strategy: EditStrategy) {
  const root = await mkdtemp(join(tmpdir(), 'nodus-editor-'));
  roots.push(root);
  await writeFile(join(root, 'a.ts'), 'A\n', 'utf8');
  await writeFile(join(root, 'b.ts'), 'B\n', 'utf8');
  const project = new ProjectFiles({ id: 'test', root, scanMode: 'manual', include: [], exclude: [] }, logger);
  return { root, project, editor: new ProjectEditor(project, logger, [strategy]) };
}

function scripted(outputs: Record<string, string>): EditStrategy {
  return {
    id: 'range-replace',
    async prepare(context) {
      const content = outputs[context.edit.path];
      if (content === undefined) return { status: 'not-completed', reason: `No scripted output for ${context.edit.path}` };
      return { status: 'completed', path: context.edit.path, content, operations: 1 };
    },
  };
}

describe('ProjectEditor', () => {
  it('prepares the complete multi-file set before applying it', async () => {
    const { root, project, editor } = await fixture(scripted({ 'a.ts': 'AA\n', 'b.ts': 'BB\n' }));
    const task = new Task('task', project.id);
    const prepared = await editor.change(task, step, {
      strategy: 'range-replace',
      edits: [
        { path: 'a.ts', instruction: 'change A' },
        { path: 'b.ts', instruction: 'change B' },
      ],
    });

    expect(prepared.status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('A\n');
    expect(await readFile(join(root, 'b.ts'), 'utf8')).toBe('B\n');

    const applied = await editor.apply();
    expect(applied.status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('AA\n');
    expect(await readFile(join(root, 'b.ts'), 'utf8')).toBe('BB\n');
  });

  it('does not accumulate anything when one edit cannot be prepared', async () => {
    const strategy: EditStrategy = {
      id: 'range-replace',
      async prepare(context) {
        if (context.edit.path === 'b.ts') return { status: 'not-completed', reason: 'cannot prepare b' };
        return { status: 'completed', path: context.edit.path, content: 'AA\n', operations: 1 };
      },
    };
    const { root, project, editor } = await fixture(strategy);
    const result = await editor.change(new Task('task', project.id), step, {
      strategy: 'range-replace',
      edits: [{ path: 'a.ts', instruction: 'change A' }, { path: 'b.ts', instruction: 'change B' }],
    });
    expect(result).toEqual({ status: 'not-completed', reason: 'cannot prepare b' });
    expect((await editor.apply()).status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('A\n');
    expect(await readFile(join(root, 'b.ts'), 'utf8')).toBe('B\n');
  });

  it('applies multiple intents for one file sequentially in memory', async () => {
    const strategy: EditStrategy = {
      id: 'range-replace',
      async prepare(context) {
        return { status: 'completed', path: context.edit.path, content: context.source + context.edit.instruction + '\n', operations: 1 };
      },
    };
    const { root, project, editor } = await fixture(strategy);
    const prepared = await editor.change(new Task('task', project.id), step, {
      strategy: 'range-replace',
      edits: [{ path: 'a.ts', instruction: 'first' }, { path: 'a.ts', instruction: 'second' }],
    });
    expect(prepared.status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('A\n');
    expect((await editor.apply()).status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('A\nfirst\nsecond\n');
  });

  it('falls back to the next technical strategy without rerunning Worker intent', async () => {
    const range: EditStrategy = {
      id: 'range-replace',
      async prepare() {
        return { status: 'not-completed', reason: 'Range replace context is ambiguous near line 2' };
      },
    };
    const diff: EditStrategy = {
      id: 'diff',
      async prepare(context) {
        return { status: 'completed', path: context.edit.path, content: 'AA\n', operations: 1 };
      },
    };
    const root = await mkdtemp(join(tmpdir(), 'nodus-editor-fallback-'));
    roots.push(root);
    await writeFile(join(root, 'a.ts'), 'A\n', 'utf8');
    const project = new ProjectFiles({ id: 'test', root, scanMode: 'manual', include: [], exclude: [] }, logger);
    const editor = new ProjectEditor(project, logger, [range, diff], new EditValidator(), {
      'range-replace': ['diff'],
      replace: [],
      diff: [],
      edit: [],
    });

    const prepared = await editor.change(new Task('task', project.id), step, {
      strategy: 'range-replace',
      edits: [{ path: 'a.ts', instruction: 'change A' }],
    });

    expect(prepared.status).toBe('completed');
    expect((await editor.apply()).status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('AA\n');
  });
});
