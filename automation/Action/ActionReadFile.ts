import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { sWorkerReadContext } from '@engine/Worker/WorkerContext.js';
import type { sCoreModuleRequest, tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import { actionCoreResult } from './ActionCoreResult.js';

export interface sReadFileActionInput {
  path: string;
  readFile: (path: string) => Promise<string>;
}

/** Cheap task-local read of one already known project file. */
export class ReadFileAction implements WorkerAction<sReadFileActionInput, sWorkerReadContext> {
  public readonly group = 'action';
  public readonly id = 'read-file';
  public readonly presentation = new ActionPresentation({ name: { en: 'Read file', ru: 'Чтение файла' } });
  public readonly name = this.presentation.name();
  public readonly description = 'Read the contents of one already known project file without model analysis.';

  public constructor(private readonly coreReadFile?: (path: string) => Promise<string>) {}

  public async execute(request: sCoreModuleRequest): Promise<tCoreModuleResult> {
    const input = request.task as Omit<sReadFileActionInput, 'readFile'>;
    return actionCoreResult(await this.run({
      ...input,
      readFile: this.coreReadFile ?? (async () => { throw new Error('ReadFileAction Core file reader is not configured.'); }),
    }));
  }

  public async run(input: sReadFileActionInput) {
    const path = input.path.trim();
    if (!path) return { status: 'failed' as const, reason: 'File read path is empty.', canContinue: false as const };
    try {
      return { status: 'completed' as const, data: { kind: 'read' as const, path, content: await input.readFile(path) } };
    } catch (error) {
      return { status: 'not-completed' as const, reason: error instanceof Error ? error.message : String(error), canContinue: true as const };
    }
  }
}
