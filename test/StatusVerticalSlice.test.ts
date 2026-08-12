import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Bootstrap } from '../src/app/Bootstrap.js';
import type { AppConfiguration } from '../src/app/config/Configuration.js';
import { NullLogger } from '../src/app/logging/Logger.js';
import type { ModelAdapter, RawModelResponse } from '../src/model/Adapter/ModelAdapter.js';
import type { ModelRequest } from '../src/model/Request/ModelRequest.js';

class QueueModelAdapter implements ModelAdapter {
  public readonly requests: ModelRequest[] = [];
  public constructor(private readonly responses: string[]) {}
  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    this.requests.push(request);
    const content = this.responses.shift();
    if (content === undefined) throw new Error('Model response queue exhausted');
    return { content };
  }
}

async function put(root: string, path: string, content: string) {
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

test('status task crosses Engine -> Planner -> DefaultWorker -> Research/Edit actions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nodus-status-'));
  const cliSource = [
    "const COMMANDS = [",
    "  { name: '/help', description: 'Help.' },",
    "];",
    "",
    "export function runCli(nodus: any, configuration: any, conversation: any, value: string): void {",
    "  if (value === '/help') {",
    "    console.log(COMMANDS);",
    "    return;",
    "  }",
    "}",
    "",
  ].join('\n');
  await put(root, 'src/cli/Cli.ts', cliSource);
  await put(root, 'src/project/ProjectSession.ts', "export class ProjectSession { public index?: { files: string[] }; }\n");
  await put(root, 'src/core/Conversation.ts', "export class Conversation { public id = 'conversation-id'; }\n");

  const model = new QueueModelAdapter([
    [
      'STEP status-command',
      'GOAL Add a /status CLI command that reports the requested current runtime state.',
      'CONSTRAINT Use existing APIs and structures.',
      'CONSTRAINT Do not scan or refresh the index just to display status.',
      'CONSTRAINT Do not change unrelated behavior.',
      'END',
    ].join('\n'),
    [
      'ACTION research',
      'INPUT {"question":"How are CLI commands registered and dispatched, and how can the CLI read current project id, conversation id, and existing project index file count without scan or refresh?"}',
    ].join('\n'),
    'CLI commands are listed in COMMANDS and dispatched by value checks. Use configuration.project.id, conversation.id, and nodus.projectSession.index?.files.length without scan/refresh.',
    [
      'ACTION edit-file',
      'INPUT {"path":"src/cli/Cli.ts","instruction":"Add /status to the existing command list and dispatch pattern. Print configuration.project.id, conversation.id, and nodus.projectSession.index?.files.length when available. Do not scan or refresh."}',
    ].join('\n'),
    [
      'STATUS completed',
      'ACTION patch',
      'PATH src/cli/Cli.ts',
      'DIFF',
      '--- a/src/cli/Cli.ts',
      '+++ b/src/cli/Cli.ts',
      '@@ -1,6 +1,7 @@',
      ' const COMMANDS = [',
      "   { name: '/help', description: 'Help.' },",
      "+  { name: '/status', description: 'Show current project status.' },",
      ' ];',
      ' ',
      ' export function runCli(nodus: any, configuration: any, conversation: any, value: string): void {',
      '@@ -6,5 +7,12 @@',
      "   if (value === '/help') {",
      '     console.log(COMMANDS);',
      '     return;',
      '   }',
      "+  if (value === '/status') {",
      '+    console.log(`Project: ${configuration.project.id}`);',
      '+    console.log(`Conversation: ${conversation.id}`);',
      "+    console.log(`Index files: ${nodus.projectSession.index?.files.length ?? 'not available'}`);",
      '+    return;',
      '+  }',
      ' }',
    ].join('\n'),
    [
      'STATUS completed',
      'SUMMARY /status was added using existing runtime state.',
    ].join('\n'),
  ]);

  const configuration: AppConfiguration = {
    project: { id: 'test-project', root, scanMode: 'on-open', exclude: ['.nodus'] },
    model: { provider: 'openai-compatible', endpoint: 'http://unused', model: 'mock', maxTokens: 4096 },
    runtime: { maxWorkerIterations: 6, maxResearchActions: 2, maxEditActions: 2 },
  };

  const app = await Bootstrap.create(configuration, { logger: new NullLogger(), model });
  const run = await app.engine.runTask('Добавь команду /status в CLI. Команда должна выводить текущий ID проекта, ID текущего conversation и количество файлов в индексе проекта, если индекс доступен. Используй существующие API и структуры проекта, не дублируй уже существующую логику получения этих данных. Не изменяй ничего, что не требуется для этой задачи.');

  assert.equal(run.status, 'completed');
  assert.equal(run.plan.steps.length, 1);
  assert.deepEqual(run.steps[0].result.state.history.map((entry) => entry.actionId), ['research', 'edit-file']);
  const changed = await readFile(join(root, 'src/cli/Cli.ts'), 'utf8');
  assert.match(changed, /\/status/);
  assert.match(changed, /configuration\.project\.id/);
  assert.match(changed, /conversation\.id/);
  assert.match(changed, /projectSession\.index\?\.files\.length/);
  assert.doesNotMatch(changed, /scan\(|refresh\(/);
  assert.equal(model.requests.length, 6);
});
