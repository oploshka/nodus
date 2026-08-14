import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';

export interface AgentToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type AgentModelMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: AgentToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface AgentFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AgentModelRequest {
  model: string;
  messages: AgentModelMessage[];
  tools: AgentFunctionTool[];
  toolChoice?: 'auto';
  temperature?: number;
  maxTokens?: number;
}

export interface AgentModelResponse {
  content: string | null;
  toolCalls: AgentToolCall[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  finishReason?: string;
}

/** Optional adapter capability used only by agent-style model lifecycles. */
export interface AgentModelAdapter {
  completeAgent(request: AgentModelRequest): Promise<AgentModelResponse>;
}

export function isAgentModelAdapter(adapter: ModelAdapter): adapter is ModelAdapter & AgentModelAdapter {
  return typeof (adapter as Partial<AgentModelAdapter>).completeAgent === 'function';
}
