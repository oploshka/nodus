import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export class TestProject {
  private constructor(public readonly root: string) {}

  public static async create(label: string, files: Record<string, string> = {}): Promise<TestProject> {
    const safe = label.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'scenario';
    const project = new TestProject(await mkdtemp(join(tmpdir(), `nodus-${safe}-`)));
    for (const [path, content] of Object.entries(files)) await project.write(path, content);
    return project;
  }

  public async read(path: string): Promise<string> {
    return readFile(join(this.root, path), 'utf8');
  }

  public async write(path: string, content: string): Promise<void> {
    const absolute = join(this.root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  }

  public async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
