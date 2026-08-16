import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { sWorkerReadContext } from '@engine/Worker/WorkerContext.js';

export interface sReadProjectActionInput {
  path: string;
  readFile: (path: string) => Promise<string>;
}

/** Cheap task-local read. The Worker supplies its current Edit view as the reader. */
export class ReadProjectAction implements WorkerAction<sReadProjectActionInput, sWorkerReadContext> {
  public readonly id = 'read';
  public readonly presentation = new ActionPresentation({ name: { en: 'Project read', ru: 'Чтение проекта' } });
  public readonly name = this.presentation.name();
  public readonly description = 'Read one known project file without model analysis.';

  public async run(input: sReadProjectActionInput) {
    const path = input.path.trim();
    if (!path) return { status: 'failed' as const, reason: 'Read path is empty.', canContinue: false as const };
    try {
      return { status: 'completed' as const, data: { kind: 'read' as const, path, content: await input.readFile(path) } };
    } catch (error) {
      return { status: 'not-completed' as const, reason: error instanceof Error ? error.message : String(error), canContinue: true as const };
    }
  }
}
