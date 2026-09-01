import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectEditor } from '@engine/Edit/ProjectEditor.js';
import type { EditStrategy } from '@engine/Edit/EditStrategy.js';
import { EditValidator } from '@engine/Edit/Validation/EditValidator.js';
import { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { PathResolver } from '@engine/Common/Tools/PathResolver.js';
import type { tEngineEmit } from '@engine/Core/EngineSchemaTsType.js';

const emit: tEngineEmit = () => undefined;
const roots: string[] = [];
const step = { task: 'goal' };
const task = { description: 'task' };

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(strategy: EditStrategy) {
  const root = await mkdtemp(join(tmpdir(), 'nodus-editor-'));
  roots.push(root);
  await writeFile(join(root, 'a.ts'), 'A\n', 'utf8');
  await writeFile(join(root, 'b.ts'), 'B\n', 'utf8');
  const fileSystem = new FileSystem(root, new PathResolver(root), () => undefined, emit, []);
  return { root, editor: new ProjectEditor(fileSystem, [strategy]), fileSystem };
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
    const { root, editor } = await fixture(scripted({ 'a.ts': 'AA\n', 'b.ts': 'BB\n' }));
    const prepared = await editor.change(task, step, {
      strategy: 'range-replace',
      edits: [
        { path: 'a.ts', instruction: 'change A' },
        { path: 'b.ts', instruction: 'change B' },
      ],
    }, emit);

    expect(prepared.status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('A\n');
    expect(await readFile(join(root, 'b.ts'), 'utf8')).toBe('B\n');

    const applied = await editor.apply(undefined, emit);
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
    const { root, editor } = await fixture(strategy);
    const result = await editor.change(task, step, {
      strategy: 'range-replace',
      edits: [{ path: 'a.ts', instruction: 'change A' }, { path: 'b.ts', instruction: 'change B' }],
    }, emit);
    expect(result).toEqual({ status: 'not-completed', reason: 'cannot prepare b' });
    expect((await editor.apply(undefined, emit)).status).toBe('completed');
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
    const { root, editor } = await fixture(strategy);
    const prepared = await editor.change(task, step, {
      strategy: 'range-replace',
      edits: [{ path: 'a.ts', instruction: 'first' }, { path: 'a.ts', instruction: 'second' }],
    }, emit);
    expect(prepared.status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('A\n');
    expect((await editor.apply(undefined, emit)).status).toBe('completed');
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
      async prepare() {
        return { status: 'completed', path: 'a.ts', content: 'AA\n', operations: 1 };
      },
    };
    const root = await mkdtemp(join(tmpdir(), 'nodus-editor-fallback-'));
    roots.push(root);
    await writeFile(join(root, 'a.ts'), 'A\n', 'utf8');
    const fileSystem = new FileSystem(root, new PathResolver(root), () => undefined, emit, []);
    const editor = new ProjectEditor(fileSystem, [range, diff], new EditValidator(), {
      'range-replace': ['diff'],
      replace: [],
      diff: [],
      edit: [],
    });

    const prepared = await editor.change(task, step, {
      strategy: 'range-replace',
      edits: [{ path: 'a.ts', instruction: 'change A' }],
    }, emit);

    expect(prepared.status).toBe('completed');
    expect((await editor.apply(undefined, emit)).status).toBe('completed');
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('AA\n');
  });
});
