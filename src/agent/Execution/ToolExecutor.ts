// ToolExecutor.ts
import type { Execution, ToolContextEntry } from '@core/Execution/Execution';
import type { LogContext } from '@core/Logging/Log';
import type { Logger } from '@core/Logging/Logger';
import type { ToolCallRequest } from '@model/Result/OperationResult';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';

export class ToolExecutor {
  private static readonly MAX_CALLS_PER_BATCH = 5;

  public constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
  ) {}

  public async execute(
    calls: ToolCallRequest[],
    execution: Execution,
    logContext: LogContext,
  ): Promise<void> {
    const selectedCalls = calls.slice(0, ToolExecutor.MAX_CALLS_PER_BATCH);
    const toolContext: ToolContextEntry[] = [];
    let success = 0;
    let failed = 0;

    await this.logger.info('tools-started', {
      requested: calls.length,
      executing: selectedCalls.length,
      truncated: Math.max(0, calls.length - selectedCalls.length),
    }, logContext);

    for (const call of selectedCalls) {
      const tool = this.toolRegistry.get(call.tool);
      if (!tool) {
        failed += 1;
        execution.addEvent('tool-result', {
          tool: call.tool,
          input: call.input,
          ok: false,
          error: 'Tool not found',
        });
        await this.logger.warn('tool-missing', { tool: call.tool, input: call.input }, logContext);
        continue;
      }

      const result = await tool.execute(call.input, {
        projectRoot: this.projectSession.root,
        exclude: this.projectSession.configuration.exclude ?? [],
      });

      toolContext.push({ call, result });
      if (result.ok) {
        success += 1;
      } else {
        failed += 1;
      }

      execution.addEvent('tool-result', {
        tool: call.tool,
        input: call.input,
        ok: result.ok,
        size: this.estimateSize(result.data),
        error: result.error,
      });

      if (!result.ok) {
        await this.logger.warn('tool-failed', {
          tool: call.tool,
          input: call.input,
          error: result.error,
        }, logContext);
      }
    }

    execution.setToolContext(toolContext, 2);

    await this.logger.info('tools-finished', {
      count: selectedCalls.length,
      success,
      failed,
    }, logContext);
  }

  private estimateSize(value: unknown): number {
    if (value === undefined) {
      return 0;
    }

    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
}
