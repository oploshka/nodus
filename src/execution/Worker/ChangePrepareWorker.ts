import type { ChangeExecutionContext } from '@execution/ChangeExecutionContext';
import type { ChangeState, PreparedFileChange } from '@execution/State/ChangeState';
import type { Worker } from '@execution/Worker/Worker';
import { PatchApplyWorker } from '@execution/Worker/PatchApplyWorker';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@model/Tool/Registry/ToolRegistry';

export class ChangePrepareWorker implements Worker<ChangeState, ChangeExecutionContext> {
  public readonly id = 'change-prepare';

  public constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly projectSession: ProjectSession,
    private readonly patchWorker: PatchApplyWorker,
  ) {}

  public async execute(state: ChangeState, _context: ChangeExecutionContext): Promise<ChangeState> {
    const changes = state.proposal ?? [];
    if (changes.length === 0) throw new Error('change proposal is missing');

    const tool = this.toolRegistry.get('file-system');
    if (!tool) throw new Error('file-system tool is required to prepare changes');
    const toolContext = { projectRoot: this.projectSession.root, exclude: this.projectSession.configuration.exclude ?? [] };
    const prepared: PreparedFileChange[] = [];

    for (const change of changes) {
      if (change.type === 'delete') {
        prepared.push({ change, path: change.path });
        continue;
      }

      let originalContent = change.path === state.work.targetPath ? state.authoritativeSource : undefined;
      if (originalContent === undefined) {
        const read = await tool.execute({ action: 'read', path: change.path }, toolContext);
        if (read.ok && typeof read.data === 'string') originalContent = read.data;
        else if (change.type === 'patch') {
          throw new Error(`Failed to read patch target ${change.path}: ${read.error ?? 'invalid file content'}`);
        }
      }

      const resultingContent = change.type === 'write'
        ? change.content
        : this.patchWorker.apply(originalContent ?? '', change.hunks, change.path);
      prepared.push({ change, path: change.path, originalContent, resultingContent });
    }

    return { ...state, phase: 'prepared', prepared };
  }
}
