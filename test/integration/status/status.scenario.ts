import { scenario } from '../../framework/Scenario.js';

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

export const statusScenario = scenario({
  id: 'status',
  task: 'Добавь команду /status в CLI. Команда должна выводить текущий ID проекта, ID текущего conversation и количество файлов в индексе проекта, если индекс доступен. Используй существующие API и структуры проекта, не дублируй уже существующую логику получения этих данных. Не изменяй ничего, что не требуется для этой задачи.',
  files: {
    'src/cli/Cli.ts': cliSource,
    'src/project/ProjectSession.ts': "export class ProjectSession { public index?: { files: string[] }; }\n",
    'src/core/Conversation.ts': "export class Conversation { public id = 'conversation-id'; }\n",
  },
  runtime: { maxWorkerIterations: 6, maxResearchActions: 2, maxEditActions: 2 },
  modelResponses: [
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
  ],
});
