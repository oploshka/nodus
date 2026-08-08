import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Project } from '@project/Project';
import type { ProjectIndex } from '@knowledge/Index/ProjectIndex';

export class ProjectIndexer {
  // Расширения файлов, код которых важен для контекста
  private readonly allowedExtensions = new Set([
    '.ts', '.js', '.json', '.md'
  ]);

  async index(project: Project): Promise<ProjectIndex> {
    const indexedFiles = await Promise.all(
      project.files.map(async (relativePath) => {
        const ext = path.extname(relativePath).toLowerCase();
        const absolutePath = path.join(project.root, relativePath);

        let content: string | undefined;

        // Читаем контент только для текстовых файлов и кода
        if (this.allowedExtensions.has(ext)) {
          try {
            content = await fs.readFile(absolutePath, 'utf-8');
          } catch (error) {
            console.warn(`Failed to read file ${relativePath}`);
          }
        }

        return {
          path: relativePath,
          content, // Теперь внутри индекса будет лежать сам код!
        };
      })
    );

    return {
      files: indexedFiles,
    };
  }
}
