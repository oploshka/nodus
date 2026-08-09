// ToolExecutor.ts
import type { Execution, ToolContextEntry } from '@core/Execution/Execution';
import type { LogContext } from '@core/Logging/Log';
import type { Logger } from '@core/Logging/Logger';
import type { ToolCallRequest } from '@model/Result/OperationResult';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';

export interface ToolExecutionSummary {
  requested: number;
  executed: number;
  success: number;
  failed: number;
  useful: number;
}

export function normalizeToolCallRequest(call: ToolCallRequest): ToolCallRequest {
  if (call.tool !== 'file-system') return call;

  const input = { ...call.input };
  if (input.action === undefined && typeof input.operation === 'string') {
    input.action = input.operation;
  }
  delete input.operation;
  return { ...call, input };
}

export class ToolExecutor {
  private static readonly DEFAULT_MAX_CALLS_PER_BATCH = 5;

  public constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
  ) {}

  public async execute(
    calls: ToolCallRequest[],
    execution: Execution,
    logContext: LogContext,
    maxCalls: number = ToolExecutor.DEFAULT_MAX_CALLS_PER_BATCH,
  ): Promise<ToolExecutionSummary> {
    const selectedCalls = calls.slice(0, Math.max(0, maxCalls));
    const toolContext: ToolContextEntry[] = [];
    let success = 0;
    let failed = 0;
    let useful = 0;

    await this.logger.info('tools-started', {
      requested: calls.length,
      executing: selectedCalls.length,
      truncated: Math.max(0, calls.length - selectedCalls.length),
    }, logContext);

    for (const requestedCall of selectedCalls) {
      const call = normalizeToolCallRequest(requestedCall);
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
        if (this.estimateSize(result.data) > 0) useful += 1;
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

    // Raw tool payload is intended for the immediate next model call only.
    execution.setToolContext(toolContext, 1);

    await this.logger.info('tools-finished', {
      count: selectedCalls.length,
      success,
      failed,
      useful,
    }, logContext);

    return {
      requested: calls.length,
      executed: selectedCalls.length,
      success,
      failed,
      useful,
    };
  }

  private estimateSize(value: unknown): number {
    if (value === undefined) return 0;
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
}
