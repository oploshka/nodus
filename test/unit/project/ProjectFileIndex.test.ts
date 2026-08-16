import { describe, expect, it } from 'vitest';
import { ProjectFileIndex, type sProjectFileIndexState } from '@engine/Project/File/Index/ProjectFileIndex.js';

function state(paths: Array<{ path: string; imports?: string[]; exports?: string[] }>): sProjectFileIndexState {
  return {
    version: 1,
    projectId: 'test',
    root: '.',
    scannedAt: new Date(0).toISOString(),
    files: paths.map((file) => ({
      path: file.path,
      extension: '.ts',
      size: 1,
      modifiedAt: new Date(0).toISOString(),
      imports: file.imports ?? [],
      exports: file.exports ?? [],
    })),
  };
}

describe('ProjectFileIndex', () => {
  it('owns lookup operations over one loaded index state', () => {
    const index = new ProjectFileIndex(state([
      { path: 'src/TodoStore.ts', exports: ['TodoStore'] },
      { path: 'src/TodoService.ts', imports: ['./TodoStore.js'], exports: ['TodoService'] },
    ]));

    expect(index.has('src/TodoStore.ts')).toBe(true);
    expect(index.get('./src/TodoStore.ts')?.path).toBe('src/TodoStore.ts');
    expect(index.list()).toHaveLength(2);
    expect(index.findFiles('TodoStore', 1)[0]?.path).toBe('src/TodoStore.ts');
  });

  it('can replace its state without changing the runtime capability', () => {
    const index = new ProjectFileIndex(state([{ path: 'src/Before.ts' }]));

    index.replace(state([{ path: 'src/After.ts' }]));

    expect(index.has('src/Before.ts')).toBe(false);
    expect(index.has('src/After.ts')).toBe(true);
    expect(index.snapshot().files.map((file) => file.path)).toEqual(['src/After.ts']);
  });
});
