import { scenario } from '@test-framework/Scenario.js';

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
    'src/Cli/Cli.ts': cliSource,
    'src/Project/ProjectSession.ts': "export class ProjectSession { public index?: { files: string[] }; }\n",
    'src/core/Conversation.ts': "export class Conversation { public id = 'conversation-id'; }\n",
  },
  runtime: { maxWorkerAttempts: 4, maxResearchRequests: 2 },
  modelResponses: [
    JSON.stringify({
      steps: [{
        id: 'status-command',
        goal: 'Add a /status CLI command that reports the requested current runtime state.',
        constraints: [
          'Use existing APIs and structures.',
          'Do not scan or refresh the index just to display status.',
          'Do not change unrelated behavior.',
        ],
        decompositionType: 'coherent-outcome',
      }],
    }),
    JSON.stringify({ optionId: 'code' }),
    JSON.stringify({
      outcome: 'missing-information',
      reason: 'The CLI file is known, but the existing access paths for runtime state must be confirmed before editing.',
      questions: ['How can the CLI read current project id, conversation id, and existing project index file count without scan or refresh?'],
    }),
    'Use configuration.project.id, conversation.id, and nodus.projectSession.index?.files.length without scan/refresh.',
    JSON.stringify({
      outcome: 'ready',
      summary: '/status was added using existing runtime state.',
      edits: [{
        path: 'src/Cli/Cli.ts',
        instruction: 'Add /status to the existing command list and dispatch pattern. Print configuration.project.id, conversation.id, and nodus.projectSession.index?.files.length when available. Do not scan or refresh.',
      }],
    }),
    JSON.stringify({
      path: 'src/Cli/Cli.ts',
      operations: [
        {
          startLine: 2,
          endLine: 2,
          expected: "  { name: '/help', description: 'Help.' },",
          replacement: [
            "  { name: '/help', description: 'Help.' },",
            "  { name: '/status', description: 'Show current project status.' },",
          ].join('\n'),
        },
        {
          startLine: 6,
          endLine: 9,
          expected: [
            "  if (value === '/help') {",
            '    console.log(COMMANDS);',
            '    return;',
            '  }',
          ].join('\n'),
          replacement: [
            "  if (value === '/help') {",
            '    console.log(COMMANDS);',
            '    return;',
            '  }',
            "  if (value === '/status') {",
            '    console.log(`Project: ${configuration.project.id}`);',
            '    console.log(`Conversation: ${conversation.id}`);',
            "    console.log(`Index files: ${nodus.projectSession.index?.files.length ?? 'not available'}`);",
            '    return;',
            '  }',
          ].join('\n'),
        },
      ],
    }),
  ],
});
