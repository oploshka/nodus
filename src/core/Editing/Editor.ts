// Editor.ts

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChangeSet } from '@core/Editing/ChangeSet';

export class Editor {
  async apply(changeSet: ChangeSet): Promise<void> {
    for (const change of changeSet.changes) {
      switch (change.type) {
        case 'create':
        case 'update':
          if (change.content === undefined) {
            throw new Error(
              `Content is required for ${change.type}: ${change.path}`,
            );
          }

          await fs.mkdir(path.dirname(change.path), {
            recursive: true,
          });

          await fs.writeFile(
            change.path,
            change.content,
            'utf-8',
          );

          break;

        case 'delete':
          await fs.rm(change.path, {
            force: true,
          });

          break;
      }
    }
  }
}