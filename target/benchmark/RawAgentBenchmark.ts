import { ConfigurationLoader } from 'src/app/Config/ConfigurationLoader.js';
import { FileSystemTool } from 'src/model/Tool/FileSystem/FileSystemTool.js';
import { SearchTool } from 'src/model/Tool/Search/SearchTool.js';
import { TerminalTool } from 'src/model/Tool/Terminal/TerminalTool.js';
import type { Tool, ToolContext } from 'src/model/Tool/Tool.js';

const DEFAULT_TASK = `Добавь команду /status в CLI. Команда должна выводить текущий ID проекта, ID текущего conversation и количество файлов в индексе проекта, если индекс доступен. Используй существующие API и структуры проекта, не дублируй уже существующую логику получения этих данных. Не изменяй ничего, что не требуется для этой задачи.`;

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface AssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: ToolCall[];
}

interface ChatResponse {
  choices?: Array<{ message?: AssistantMessage }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

type Message =
  | { role: 'system' | 'user'; content: string }
  | AssistantMessage
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

function toolSchema(tool: Tool) {
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

function parseTextToolCall(content: string | null | undefined): ToolCall[] {
  if (!content) return [];

  // KoboldCpp/Jinja may serialize a tool request as: tool-name[ARGS]{...json...}
  const match = content.trim().match(/^([a-zA-Z0-9_-]+)\[ARGS\]\s*(\{[\s\S]*\})\s*$/);
  if (!match) return [];

  try {
    JSON.parse(match[2]);
  } catch {
    return [];
  }

  return [{
    id: `text-tool-${Date.now()}`,
    type: 'function',
    function: { name: match[1], arguments: match[2] },
  }];
}

async function requestModel(
  endpoint: string,
  apiKey: string | undefined,
  body: Record<string, unknown>,
): Promise<ChatResponse> {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: ChatResponse;
  try {
    payload = JSON.parse(text) as ChatResponse;
  } catch {
    throw new Error(`Non-JSON model response: ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
  }

  return payload;
}

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? 'nodus.config.json';
  const task = process.argv.slice(3).join(' ').trim() || DEFAULT_TASK;
  const configuration = await ConfigurationLoader.load(configPath);

  if (configuration.model.provider !== 'openai-compatible' || !configuration.model.endpoint) {
    throw new Error('Raw benchmark requires model.provider=openai-compatible and model.endpoint');
  }

  const tools: Tool[] = [new FileSystemTool(), new SearchTool(), new TerminalTool()];
  const toolsByName = new Map(tools.map((tool) => [tool.definition.id, tool]));
  const context: ToolContext = {
    projectRoot: configuration.project.root,
    exclude: configuration.project.exclude ?? [],
  };

  const messages: Message[] = [
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
    { role: 'user', content: task },
  ];

  const maxRounds = 50;
  let modelCalls = 0;
  let toolCalls = 0;
  let totalTokens = 0;

  console.log(`Raw agent benchmark`);
  console.log(`Project root: ${configuration.project.root}`);
  console.log(`Model: ${configuration.model.model}`);
  console.log(`Task: ${task}`);
  console.log('---');

  for (let round = 1; round <= maxRounds; round += 1) {
    const response = await requestModel(configuration.model.endpoint, configuration.model.apiKey, {
      model: configuration.model.model,
      messages,
      tools: tools.map(toolSchema),
      tool_choice: 'auto',
      temperature: configuration.model.temperature ?? 0.2,
      max_tokens: configuration.model.maxTokens ?? 4096,
    });

    modelCalls += 1;
    totalTokens += response.usage?.total_tokens ?? 0;

    const message = response.choices?.[0]?.message;
    if (!message) throw new Error('Model returned no assistant message');

    const nativeCalls = message.tool_calls ?? [];
    const calls = nativeCalls.length > 0 ? nativeCalls : parseTextToolCall(message.content);

    if (calls.length === 0) {
      console.log(`Assistant: ${message.content ?? '<empty>'}`);
      console.log('---');
      console.log(`Result: ${modelCalls} model calls, ${toolCalls} tool calls${totalTokens ? `, ${totalTokens} tokens` : ''}`);
      return;
    }

    // Preserve the assistant turn in a form accepted by OpenAI-compatible chat APIs.
    messages.push({
      role: 'assistant',
      content: nativeCalls.length > 0 ? (message.content ?? null) : null,
      tool_calls: calls,
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
        if (!tool) {
          result = { ok: false, error: `Unknown tool: ${call.function.name}` };
        } else {
          result = await tool.execute(args, context);
        }
      }

      toolCalls += 1;
      console.log(`Tool ${toolCalls}: ${call.function.name} ${JSON.stringify(args)}`);
      console.log(`  -> ${JSON.stringify(result).slice(0, 1200)}`);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(`Raw agent exceeded maxRounds=${maxRounds}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
