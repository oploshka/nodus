// ChangeExecutor.ts
import type { FileChange } from '@core/Change/ChangeSet';
import type { Execution } from '@core/Execution/Execution';
import type { LogContext } from '@core/Logging/Log';
import type { Logger } from '@core/Logging/Logger';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';
import type { ToolResult } from '@tool/Tool/Tool';

export class ChangeExecutor {
  public constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
  ) {}

  public async apply(
    changes: FileChange[],
    execution: Execution,
    logContext: LogContext,
  ): Promise<void> {
    const tool = this.toolRegistry.get('file-system');
    if (!tool) {
      throw new Error('file-system tool is required to apply changes');
    }

    for (const change of changes) {
      let result: ToolResult;
      if (change.type === 'write') {
        result = await tool.execute({ action: 'write', path: change.path, content: change.content }, {
          projectRoot: this.projectSession.root,
          exclude: this.projectSession.configuration.exclude ?? [],
        });
      } else {
        result = await tool.execute({ action: 'delete', path: change.path }, {
          projectRoot: this.projectSession.root,
          exclude: this.projectSession.configuration.exclude ?? [],
        });
      }

      execution.addEvent('change-applied', {
        type: change.type,
        path: change.path,
        ok: result.ok,
        error: result.error,
      });

      await this.logger.info('change-applied', {
        type: change.type,
        path: change.path,
        ok: result.ok,
      }, logContext);

      if (!result.ok) {
        throw new Error(`Failed to apply change ${change.path}: ${result.error ?? 'unknown error'}`);
      }
    }
  }
}
