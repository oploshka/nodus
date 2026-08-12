import type { ChangeExecutionContext } from '@execution/ChangeExecutionContext';
import type { ChangeState } from '@execution/State/ChangeState';
import type { Worker } from '@execution/Worker/Worker';
import type { Logger } from '@core/Logging/Logger';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@model/Tool/Registry/ToolRegistry';
import type { ToolResult } from '@model/Tool/Tool/Tool';

export class ChangeCommitWorker implements Worker<ChangeState, ChangeExecutionContext> {
  public readonly id = 'change-commit';

  public constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
  ) {}

  public async execute(state: ChangeState, context: ChangeExecutionContext): Promise<ChangeState> {
    const prepared = state.prepared ?? [];
    if (prepared.length === 0) throw new Error('prepared candidate is missing');

    const tool = this.toolRegistry.get('file-system');
    if (!tool) throw new Error('file-system tool is required to commit changes');
    const toolContext = { projectRoot: this.projectSession.root, exclude: this.projectSession.configuration.exclude ?? [] };

    for (const item of prepared) {
      let result: ToolResult;
      if (item.change.type === 'delete') result = await tool.execute({ action: 'delete', path: item.path }, toolContext);
      else result = await tool.execute({ action: 'write', path: item.path, content: item.resultingContent ?? '' }, toolContext);
      context.execution.addEvent('change-applied', { type: item.change.type, path: item.path, ok: result.ok, error: result.error });
      await this.logger.info('change-applied', { type: item.change.type, path: item.path, ok: result.ok }, context.logContext);
      if (!result.ok) throw new Error(`Failed to apply change ${item.path}: ${result.error ?? 'unknown error'}`);
      const invalidated = this.projectSession.research.invalidateBySource(item.path);
      if (invalidated.length > 0) {
        context.execution.addEvent('research-invalidated', { path: item.path, facts: invalidated });
      }
    }

    return { ...state, phase: 'completed' };
  }
}
