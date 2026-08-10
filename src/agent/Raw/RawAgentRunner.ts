import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Logger } from '@core/Logging/Logger';
import type { ModelMessage, ModelToolCall, ModelToolDefinition } from '@model/Request/ModelRequest';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';

const RAW_AGENT_SYSTEM_PROMPT = `You are a coding agent working directly on the current project.
Complete the user's task by inspecting and editing the project with the provided tools.
Do not assume project structure or APIs: inspect them first.
Make the smallest change that fully satisfies the task and do not modify unrelated code.
Use file-system write to actually apply changes; do not merely describe them.
Use terminal only when useful for verification.
Finish with a concise summary only after the task is complete. If blocked, explain the concrete blocker.`;

export interface RawAgentTraceEntry {
  tool: string;
  input: Record<string, unknown>;
  ok?: boolean;
}

export interface RawAgentRunResult {
  result: string;
  modelCalls: number;
  toolCalls: number;
  projectRoot: string;
  trace: RawAgentTraceEntry[];
}

export class RawAgentRunner {
  private static readonly MAX_TOOL_RESULT_CHARS = 24_000;

  public constructor(
    private readonly model: ModelConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly toolRegistry: ToolRegistry,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
  ) {}

  public async run(task: string, maxSteps: number): Promise<RawAgentRunResult> {
    const messages: ModelMessage[] = [
      { role: 'system', content: RAW_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: task },
    ];
    const tools = this.createToolDefinitions();
    let modelCalls = 0;
    let toolCalls = 0;
    const trace: RawAgentTraceEntry[] = [];

    for (let step = 1; step <= maxSteps; step += 1) {
      await this.logger.info('raw-agent-model-called', { step }, { projectId: this.projectSession.configuration.id });
      const response = await this.adapter.complete({
        model: this.model.model,
        messages,
        temperature: this.model.temperature,
        maxTokens: this.model.maxTokens,
        tools,
        toolChoice: 'auto',
      });
      modelCalls += 1;

      const calls = response.toolCalls ?? [];
      if (calls.length === 0) {
        const candidate = response.content.trim();
        if (this.looksLikeToolTranscript(candidate)) {
          messages.push({ role: 'assistant', content: candidate });
          messages.push({
            role: 'user',
            content: 'Do not print or replay tool-call protocol or tool results. If more work is needed, use the native tools. If the task is complete, return only a concise final summary.',
          });
          continue;
        }

        const result = candidate || 'Raw agent completed without a final message.';
        await this.logger.info('raw-agent-completed', { step, modelCalls, toolCalls }, { projectId: this.projectSession.configuration.id });
        return { result, modelCalls, toolCalls, projectRoot: this.projectSession.root, trace };
      }

      // KoboldCpp/Jinja may mirror a textual representation of the tool call in
      // message.content while also returning a native tool_calls array. Keep only
      // the canonical native representation in history to avoid feeding the same
      // tool call back to the model twice.
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: calls,
      });

      for (const call of calls) {
        const execution = await this.executeToolCall(call);
        toolCalls += 1;
        trace.push({ tool: call.function.name, input: execution.input, ok: this.toolResultOk(execution.result) });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: this.serializeToolResult(execution.result),
        });
      }
    }

    throw new Error(`Raw agent exceeded maxSteps=${maxSteps}`);
  }

  private async executeToolCall(call: ModelToolCall): Promise<{ input: Record<string, unknown>; result: unknown }> {
    const tool = this.toolRegistry.get(call.function.name);
    if (!tool) {
      return { input: {}, result: { ok: false, error: `Unknown tool: ${call.function.name}` } };
    }

    let input: Record<string, unknown>;
    try {
      const parsed = JSON.parse(call.function.arguments || '{}') as unknown;
      input = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch (error) {
      return { input: {}, result: { ok: false, error: `Invalid tool arguments: ${String(error)}` } };
    }

    await this.logger.info('raw-agent-tool-called', { tool: call.function.name, input }, { projectId: this.projectSession.configuration.id });
    const result = await tool.execute(input, {
      projectRoot: this.projectSession.root,
      exclude: this.projectSession.configuration.exclude ?? [],
    });
    return { input, result };
  }

  private toolResultOk(value: unknown): boolean | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const ok = (value as { ok?: unknown }).ok;
    return typeof ok === 'boolean' ? ok : undefined;
  }

  private looksLikeToolTranscript(content: string): boolean {
    if (!content) return false;
    if (/\[TOOL_CALLS?\]/i.test(content)) return true;
    return /^\s*(?:search|file-system|terminal)\s*\{/i.test(content);
  }

  private serializeToolResult(value: unknown): string {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      serialized = String(value);
    }

    if (serialized.length <= RawAgentRunner.MAX_TOOL_RESULT_CHARS) {
      return serialized;
    }
    return `${serialized.slice(0, RawAgentRunner.MAX_TOOL_RESULT_CHARS)}\n...[tool result truncated]`;
  }

  private createToolDefinitions(): ModelToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'file-system',
          description: 'Read, write, list, delete, or check project files. Paths are relative to project root.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['read', 'write', 'list', 'delete', 'exists'] },
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['action', 'path'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'Search text recursively in project files.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              path: { type: 'string' },
              maxResults: { type: 'number' },
              caseSensitive: { type: 'boolean' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'terminal',
          description: 'Execute a shell command inside the project root. Use primarily for verification.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              cwd: { type: 'string' },
              timeoutMs: { type: 'number' },
            },
            required: ['command'],
            additionalProperties: false,
          },
        },
      },
    ];
  }
}
