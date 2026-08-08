// Editor.ts

import type { ChangeSet } from '@core/Editing/ChangeSet';

export class Editor {
  async apply(changeSet: ChangeSet): Promise<void> {
    for (const change of changeSet.changes) {
      console.log('Apply change:', change.path);
    }
  }
}