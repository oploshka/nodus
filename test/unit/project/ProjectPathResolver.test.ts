import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectPathResolver } from '@engine/Project/ProjectPathResolver.js';
import type { ProjectIndex } from '@engine/Project/ProjectIndex.js';
import { TestProject } from '@test/framework/TestProject.js';

function index(root: string, paths: string[]): ProjectIndex {
  return {
    version: 1,
    projectId: 'test',
    root,
    scannedAt: new Date(0).toISOString(),
    files: paths.map((path) => ({ path, extension: '', size: 1, modifiedAt: new Date(0).toISOString(), imports: [], exports: [] })),
  };
}

describe('ProjectPathResolver', () => {
  it('keeps canonical project-root-relative paths unchanged and requires existing files', async () => {
    const fixture = await TestProject.create('path-canonical', {
      'src/engine/Planner/ModelPlanner.ts': 'export {};\n',
      'nodus.config.example.json': '{}\n',
    });
    try {
      const resolver = new ProjectPathResolver(fixture.root);
      const projectIndex = index(fixture.root, ['src/engine/Planner/ModelPlanner.ts', 'nodus.config.example.json']);

      await expect(resolver.resolveExisting('src/engine/Planner/ModelPlanner.ts', projectIndex))
        .resolves.toBe('src/engine/Planner/ModelPlanner.ts');
      await expect(resolver.resolveExisting('nodus.config.example.json', projectIndex))
        .resolves.toBe('nodus.config.example.json');
      await expect(resolver.resolveExisting('missing.ts', projectIndex))
        .rejects.toThrow('Project file not found');
    } finally {
      await fixture.dispose();
    }
  });

  it('accepts decorated and absolute references only when they resolve inside the project', async () => {
    const fixture = await TestProject.create('path-absolute', { 'src/app/Main.ts': 'export {};\n' });
    try {
      const resolver = new ProjectPathResolver(fixture.root);
      const absolute = resolve(fixture.root, 'src/app/Main.ts');

      await expect(resolver.resolveExisting('`src/app/Main.ts`')).resolves.toBe('src/app/Main.ts');
      await expect(resolver.resolveExisting(absolute)).resolves.toBe('src/app/Main.ts');
      await expect(resolver.resolveExisting(pathToFileURL(absolute).href)).resolves.toBe('src/app/Main.ts');
    } finally {
      await fixture.dispose();
    }
  });

  it('repairs a wrong prefix when the index has one unambiguous existing match', async () => {
    const fixture = await TestProject.create('path-repair', { 'nodus.config.example.json': '{}\n' });
    try {
      const resolver = new ProjectPathResolver(fixture.root);
      const projectIndex = index(fixture.root, ['nodus.config.example.json']);

      await expect(resolver.resolveExisting('src/app/Config/nodus.config.example.json', projectIndex))
        .resolves.toBe('nodus.config.example.json');
    } finally {
      await fixture.dispose();
    }
  });

  it('does not guess when a basename is ambiguous', async () => {
    const fixture = await TestProject.create('path-ambiguous', {
      'src/a/config.json': '{}\n',
      'src/b/config.json': '{}\n',
    });
    try {
      const resolver = new ProjectPathResolver(fixture.root);
      const projectIndex = index(fixture.root, ['src/a/config.json', 'src/b/config.json']);

      await expect(resolver.resolveExisting('wrong/config.json', projectIndex))
        .rejects.toThrow('Ambiguous project path');
    } finally {
      await fixture.dispose();
    }
  });

  it('rejects traversal and absolute paths outside the project', async () => {
    const fixture = await TestProject.create('path-escape');
    const outside = await mkdtemp(join(tmpdir(), 'nodus-outside-'));
    const outsideFile = join(outside, 'outside.ts');
    await writeFile(outsideFile, 'export {};\n');
    try {
      const resolver = new ProjectPathResolver(fixture.root);
      await expect(resolver.resolveExisting('../outside.ts')).rejects.toThrow('escapes project root');
      await expect(resolver.resolveExisting(outsideFile)).rejects.toThrow('outside project root');
      await expect(resolver.resolveExisting(pathToFileURL(outsideFile).href)).rejects.toThrow('outside project root');
    } finally {
      await fixture.dispose();
    }
  });

  it('checks real paths so an in-project symlink cannot escape the root', async () => {
    const fixture = await TestProject.create('path-symlink');
    const outside = await mkdtemp(join(tmpdir(), 'nodus-symlink-outside-'));
    const outsideFile = join(outside, 'secret.txt');
    await writeFile(outsideFile, 'secret\n');
    try {
      await symlink(outsideFile, resolve(fixture.root, 'secret-link.txt'), 'file');
      const resolver = new ProjectPathResolver(fixture.root);
      await expect(resolver.resolveExisting('secret-link.txt')).rejects.toThrow('resolves outside project root');
    } finally {
      await fixture.dispose();
    }
  });

  it('allows a missing create target only when its existing parent stays inside the project', async () => {
    const fixture = await TestProject.create('path-target');
    try {
      await mkdir(resolve(fixture.root, 'src/New'), { recursive: true });
      const resolver = new ProjectPathResolver(fixture.root);
      await expect(resolver.resolveTarget('src/New/File.ts')).resolves.toBe('src/New/File.ts');
      await expect(resolver.resolveTarget('../outside/File.ts')).rejects.toThrow('escapes project root');
    } finally {
      await fixture.dispose();
    }
  });
});
