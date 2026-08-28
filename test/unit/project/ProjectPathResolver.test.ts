import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PathResolver } from '@engine/Common/Tools/PathResolver.js';
import type { ProjectFileIndex } from '@engine/Project/File/ProjectFileIndex.js';
import { TestProject } from '@test-framework/TestProject.js';

function index(root: string, paths: string[]): ProjectFileIndex {
  return {
    version: 1,
    projectId: 'test',
    root,
    scannedAt: new Date(0).toISOString(),
    files: paths.map((path) => ({ path, extension: '', size: 1, modifiedAt: new Date(0).toISOString(), imports: [], exports: [] })),
  };
}

describe('PathResolver', () => {
  it('keeps canonical project-root-relative paths unchanged and requires existing files', async () => {
    const fixture = await TestProject.create('path-canonical', {
      'src/engine/Planner/ModelPlanner.ts': 'export {};\n',
      'nodus.config.example.json': '{}\n',
    });
    try {
      const resolver = new PathResolver(fixture.root);
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
      const resolver = new PathResolver(fixture.root);
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
      const resolver = new PathResolver(fixture.root);
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
      const resolver = new PathResolver(fixture.root);
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
      const resolver = new PathResolver(fixture.root);
      await expect(resolver.resolveExisting('../outside.ts')).rejects.toThrow('escapes project root');
      await expect(resolver.resolveExisting(outsideFile)).rejects.toThrow('outside project root');
      await expect(resolver.resolveExisting(pathToFileURL(outsideFile).href)).rejects.toThrow('outside project root');
    } finally {
      await fixture.dispose();
    }
  });

  it('blocks hard-protected directories but does not hard-block .nodus inside the resolver', async () => {
    const fixture = await TestProject.create('path-protected', {
      'node_modules/pkg/index.js': 'module.exports = {};\n',
      '.git/config': '[core]\n',
    });
    try {
      const resolver = new PathResolver(fixture.root);
      await expect(resolver.resolveTarget('node_modules/pkg/index.js')).rejects.toThrow('not writable by Nodus');
      await expect(resolver.resolveTarget('.git/config')).rejects.toThrow('not writable by Nodus');
      await expect(resolver.resolveTarget('.nodus/cache.json')).resolves.toBe('.nodus/cache.json');
    } finally {
      await fixture.dispose();
    }
  });

  it('blocks writes to project-excluded directories and allows normal project targets', async () => {
    const fixture = await TestProject.create('path-ignore', {
      'dist/generated.js': 'export {};\n',
      'src/generated/output.ts': 'export {};\n',
      'src/app/Main.ts': 'export {};\n',
    });
    try {
      const resolver = new PathResolver(fixture.root);
      const exclude = ['dist', 'src/generated'];

      await expect(resolver.resolveTarget('dist/generated.js', exclude)).rejects.toThrow('blocked by dist');
      await expect(resolver.resolveTarget('src/generated/output.ts', exclude)).rejects.toThrow('blocked by src/generated');
      await expect(resolver.resolveTarget('src/app/Main.ts', exclude)).resolves.toBe('src/app/Main.ts');
    } finally {
      await fixture.dispose();
    }
  });

  it('allows a missing create target only when it is writable inside the project', async () => {
    const fixture = await TestProject.create('path-target');
    try {
      await mkdir(resolve(fixture.root, 'src/New'), { recursive: true });
      const resolver = new PathResolver(fixture.root);
      await expect(resolver.resolveTarget('src/New/File.ts', ['dist'])).resolves.toBe('src/New/File.ts');
      await expect(resolver.resolveTarget('dist/NewFile.ts', ['dist'])).rejects.toThrow('not writable by Nodus');
      await expect(resolver.resolveTarget('../outside/File.ts')).rejects.toThrow('escapes project root');
    } finally {
      await fixture.dispose();
    }
  });
});
