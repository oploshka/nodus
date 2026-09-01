import type { ModelAdapter, RawModelResponse } from '@model/Adapter/ModelAdapter.js';
import type {
  AgentModelAdapter,
  AgentModelMessage,
  AgentModelRequest,
  AgentModelResponse,
  AgentToolCall,
} from '@model/Adapter/AgentModelAdapter.js';
import type { ModelRequest } from '@model/Request/ModelRequest.js';

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: AgentToolCall[];
    };
    finish_reason?: string;
  }>;
  usage?: RawModelResponse['usage'];
  error?: { message?: string };
}

export class OpenAICompatibleModelAdapter implements ModelAdapter, AgentModelAdapter {
  public constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
    private readonly requestTimeoutMs = 600_000,
  ) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    const payload = await this.request({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });

    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new Error('Model returned an empty response');

    return {
      content,
      usage: payload.usage,
      finishReason: choice?.finish_reason,
    };
  }

  public async completeAgent(request: AgentModelRequest): Promise<AgentModelResponse> {
    const payload = await this.request({
      model: request.model,
      messages: request.messages.map((message) => this.agentMessage(message)),
      tools: request.tools,
      tool_choice: request.toolChoice ?? 'auto',
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });

    const choice = payload.choices?.[0];
    if (!choice?.message) throw new Error('Model returned no assistant message');

    return {
      content: choice.message.content ?? null,
      toolCalls: choice.message.tool_calls ?? [],
      usage: payload.usage,
      finishReason: choice.finish_reason,
    };
  }

  private agentMessage(message: AgentModelMessage): Record<string, unknown> {
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length ? { tool_calls: message.toolCalls } : {}),
      };
    }

    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
    }

    return message;
  }

  private async request(body: Record<string, unknown>): Promise<OpenAICompatibleResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const url = `${this.endpoint.replace(/\/$/, '')}/chat/completions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const raw = await response.text();
      let payload: OpenAICompatibleResponse;
      try { payload = JSON.parse(raw) as OpenAICompatibleResponse; }
      catch { throw new Error(`Model returned non-JSON response: ${raw.slice(0, 240)}`); }

      if (!response.ok) throw new Error(payload.error?.message ?? `Model request failed with HTTP ${response.status}`);
      return payload;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Model request timed out after ${this.requestTimeoutMs} ms`);
      }
      if (error instanceof TypeError && error.message === 'fetch failed') {
        throw new Error(`Model request to ${url} failed: ${transportErrorMessage(error)}`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function transportErrorMessage(error: Error): string {
  const cause = error.cause;
  if (!(cause instanceof Error)) return error.message;

  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined;
  return [code, cause.message].filter(Boolean).join(' - ') || error.message;
}
