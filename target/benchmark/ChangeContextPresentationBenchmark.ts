import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';

const DEFAULT_TASK = 'Добавь поддержку удаления задач. TodoStore должен уметь удалять задачу по id, а TodoService должен предоставить соответствующий публичный метод. При попытке удалить несуществующую задачу верни false. Добавь тесты существующего и несуществующего id. Не меняй остальное поведение проекта.';
const TARGET_PATH = 'src/TodoStore.ts';

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { total_tokens?: number };
  error?: { message?: string };
}

type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

async function request(endpoint: string, apiKey: string | undefined, body: Record<string, unknown>): Promise<ChatResponse> {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = JSON.parse(await response.text()) as ChatResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
  return payload;
}

const system = [
  'You are deciding whether enough project information is available to prepare a semantic code change.',
  'Do not generate code or diffs.',
  'If a file content is already supplied, treat it as read and do not request that same file again.',
  'Return Raw fields only. Always put the value on the line after #fieldName.',
  'Allowed outcome values: ready, missing-information.',
  'If ready, return #outcome ready and at least one #edits value containing JSON with path and instruction.',
  'If information is missing, return #outcome missing-information and one or more #readFiles values.',
].join(' ');

function currentContext(task: string, content: string): Message[] {
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        task,
        step: { goal: 'Implement task deletion in TodoStore by id and return false for a missing id.' },
        candidateFiles: ['src/TodoStore.ts', 'src/TodoService.ts', 'test/TodoService.test.ts'],
        context: [{ kind: 'read', path: TARGET_PATH, content }],
      }, null, 2),
    },
  ];
}

function explicitReadResult(task: string, content: string): Message[] {
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        `TASK\n${task}`,
        '',
        `READ RESULT\npath: ${TARGET_PATH}\ncontent:\n${content}`,
      ].join('\n'),
    },
  ];
}

function actionResults(task: string, content: string): Message[] {
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        task,
        step: { goal: 'Implement task deletion in TodoStore by id and return false for a missing id.' },
        candidateFiles: ['src/TodoStore.ts', 'src/TodoService.ts', 'test/TodoService.test.ts'],
        actionResults: [{ action: 'read-file', path: TARGET_PATH, content }],
      }, null, 2),
    },
  ];
}

function toolHistory(task: string, content: string): Message[] {
  const callId = 'benchmark-read-1';
  return [
    { role: 'system', content: system },
    { role: 'user', content: task },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: callId,
        type: 'function',
        function: { name: 'read-file', arguments: JSON.stringify({ path: TARGET_PATH }) },
      }],
    },
    {
      role: 'tool',
      tool_call_id: callId,
      name: 'read-file',
      content: JSON.stringify({ ok: true, path: TARGET_PATH, content }),
    },
  ];
}

function classify(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes('#outcome\nready') || normalized.includes('#outcome ready')) return 'ready';
  if (normalized.includes('#readfiles') && normalized.includes(TARGET_PATH.toLowerCase())) return 'repeat-read';
  if (normalized.includes('#outcome\nmissing-information') || normalized.includes('#outcome missing-information')) return 'missing-information';
  return 'other';
}

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? 'target/project/nodus.config.json';
  const task = process.argv.slice(3).join(' ').trim() || DEFAULT_TASK;
  const configuration = await ConfigurationLoader.load(configPath);
  if (configuration.model.provider !== 'openai-compatible' || !configuration.model.endpoint) {
    throw new Error('Benchmark requires model.provider=openai-compatible and model.endpoint');
  }

  const file = await readFile(resolve(configuration.target.root, TARGET_PATH), 'utf8');
  const variants: Array<[string, Message[]]> = [
    ['current-context', currentContext(task, file)],
    ['explicit-read-result', explicitReadResult(task, file)],
    ['action-results', actionResults(task, file)],
    ['tool-history', toolHistory(task, file)],
  ];

  console.log(`Change context presentation benchmark`);
  console.log(`Model: ${configuration.model.model}`);
  console.log(`Target: ${TARGET_PATH}`);
  console.log('No conversation/cache identifier is sent by this benchmark; each variant sends its complete message history.');
  console.log('---');

  for (const [name, messages] of variants) {
    const response = await request(configuration.model.endpoint, configuration.model.apiKey, {
      model: configuration.model.model,
      messages,
      temperature: 0,
      max_tokens: 1024,
    });
    const text = response.choices?.[0]?.message?.content ?? '<empty>';
    console.log(`[${name}] ${classify(text)}${response.usage?.total_tokens ? ` · ${response.usage.total_tokens} tok` : ''}`);
    console.log(text);
    console.log('---');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
