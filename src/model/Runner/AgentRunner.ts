import type {
  AgentFunctionTool,
  AgentModelAdapter,
  AgentModelMessage,
  AgentToolCall,
} from '@model/Adapter/AgentModelAdapter.js';
import type { Tool, ToolContext } from '@model/Tool/Tool.js';
import type { ModelConfiguration } from '@model/Type/ModelConfiguration.js';

export interface AgentRunInput {
  message: string;
  tools: ReadonlyArray<Tool>;
  context: ToolContext;
  maxRounds?: number;
}

export type AgentRunResult =
  | { status: 'completed'; summary: string; meta: AgentRunMeta }
  | { status: 'not-completed'; reason: string; meta: AgentRunMeta };

export interface AgentRunMeta {
  rounds: number;
  modelCalls: number;
  toolCalls: number;
  totalTokens: number;
  durationMs: number;
}

/** Bounded model/tool loop used by AgentWorker. */
export class AgentRunner {
  public constructor(
    private readonly adapter: AgentModelAdapter,
    private readonly configuration: ModelConfiguration,
  ) {}

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    const toolsByName = new Map(input.tools.map((tool) => [tool.definition.id, tool]));
    const messages: AgentModelMessage[] = [
      {
        role: 'system',
        content: [
          'You are a coding agent working directly inside one repository.',
          'Use the available tools to inspect the repository, make the minimal required change, and verify it when practical.',
          'Do not invent file contents or APIs. Read/search before relying on repository details.',
          'Do not modify unrelated files.',
          'When the task is complete, answer with a concise summary of what changed and what verification you performed.',
        ].join(' '),
      },
      { role: 'user', content: input.message },
    ];

    const maxRounds = input.maxRounds ?? 12;
    const startedAt = performance.now();
    let modelCalls = 0;
    let toolCalls = 0;
    let totalTokens = 0;

    for (let round = 1; round <= maxRounds; round += 1) {
      const response = await this.adapter.completeAgent({
        model: this.configuration.model,
        messages,
        tools: input.tools.map((tool) => this.toolSchema(tool)),
        toolChoice: 'auto',
        temperature: this.configuration.temperature ?? 0,
        maxTokens: this.configuration.maxTokens ?? 4096,
      });

      modelCalls += 1;
      totalTokens += response.usage?.total_tokens ?? 0;

      const calls = response.toolCalls.length > 0
        ? response.toolCalls
        : this.parseTextToolCall(response.content);

      if (calls.length === 0) {
        const summary = response.content?.trim();
        const meta = this.meta(round, modelCalls, toolCalls, totalTokens, startedAt);
        if (!summary) return { status: 'not-completed', reason: 'Agent returned an empty final response.', meta };
        return { status: 'completed', summary, meta };
      }

      messages.push({
        role: 'assistant',
        content: response.toolCalls.length > 0 ? response.content : null,
        toolCalls: calls,
      });

      for (const call of calls) {
        const tool = toolsByName.get(call.function.name);
        let args: Record<string, unknown> = {};
        let result: unknown;

        try {
          args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        } catch {
          result = { ok: false, error: `Invalid JSON arguments: ${call.function.arguments}` };
        }

        if (result === undefined) {
          result = tool
            ? await tool.execute(args, input.context)
            : { ok: false, error: `Unknown tool: ${call.function.name}` };
        }

        toolCalls += 1;
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.function.name,
          content: JSON.stringify(result),
        });
      }
    }

    return {
      status: 'not-completed',
      reason: `Agent round limit reached (${maxRounds}).`,
      meta: this.meta(maxRounds, modelCalls, toolCalls, totalTokens, startedAt),
    };
  }

  private toolSchema(tool: Tool): AgentFunctionTool {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, description] of Object.entries(tool.definition.inputSchema)) {
      const text = String(description);
      let type: 'string' | 'number' | 'boolean' = 'string';
      if (/number/i.test(text)) type = 'number';
      if (/boolean/i.test(text)) type = 'boolean';
      properties[key] = { type, description: text };
      if (!/optional/i.test(text) && !/required for/i.test(text)) required.push(key);
    }

    return {
      type: 'function',
      function: {
        name: tool.definition.id,
        description: tool.definition.description,
        parameters: {
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        },
      },
    };
  }

  private parseTextToolCall(content: string | null): AgentToolCall[] {
    if (!content) return [];
    const match = content.trim().match(/^([a-zA-Z0-9_-]+)\[ARGS\]\s*(\{[\s\S]*\})\s*$/);
    if (!match) return [];

    try { JSON.parse(match[2]); }
    catch { return []; }

    return [{
      id: `text-tool-${Date.now()}`,
      type: 'function',
      function: { name: match[1], arguments: match[2] },
    }];
  }

  private meta(
    rounds: number,
    modelCalls: number,
    toolCalls: number,
    totalTokens: number,
    startedAt: number,
  ): AgentRunMeta {
    return {
      rounds,
      modelCalls,
      toolCalls,
      totalTokens,
      durationMs: performance.now() - startedAt,
    };
  }
}
