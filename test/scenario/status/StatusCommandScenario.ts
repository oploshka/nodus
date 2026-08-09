// StatusCommandScenario.ts
import type { TaskPlan } from '@agent/Planning/TaskPlan';

export const STATUS_COMMAND_CANONICAL_PLAN: TaskPlan = {
  version: 2,
  goal: 'Добавить команду /status в CLI с использованием существующих источников данных.',
  steps: [
    {
      id: 'step-1',
      type: 'search',
      action: 'find-examples',
      subject: 'обработка существующих CLI-команд',
      goal: 'Найти существующий пример: обработка существующих CLI-команд',
      status: 'pending',
      maxAttempts: 3,
      inputs: [],
      outputs: ['cli.command.example'],
    },
    {
      id: 'step-2',
      type: 'search',
      action: 'find-usages',
      subject: 'ProjectSession, ProjectIndex, projectId и conversationId',
      goal: 'Найти использования: ProjectSession, ProjectIndex, projectId и conversationId',
      status: 'pending',
      maxAttempts: 3,
      inputs: ['cli.command.example'],
      outputs: ['project.id.source', 'conversation.id.source', 'index.files.count.source'],
    },
    {
      id: 'step-3',
      type: 'understand',
      action: 'determine-integration',
      subject: '/status в runCli на основе найденного примера и источников данных',
      goal: 'Определить интеграцию: /status в runCli на основе найденного примера и источников данных',
      status: 'pending',
      maxAttempts: 2,
      inputs: ['cli.command.example', 'project.id.source', 'conversation.id.source', 'index.files.count.source'],
      outputs: ['cli.status.integration'],
    },
    {
      id: 'step-4',
      type: 'prepare-change',
      action: 'define-change',
      subject: 'минимальное изменение src/cli/Cli.ts для команды /status',
      goal: 'Определить точное изменение: минимальное изменение src/cli/Cli.ts для команды /status',
      status: 'pending',
      maxAttempts: 1,
      inputs: ['cli.status.integration'],
      outputs: ['status.change-plan'],
    },
    {
      id: 'step-5',
      type: 'edit-file',
      action: 'apply-change',
      subject: '/status в src/cli/Cli.ts',
      goal: 'Применить изменение: /status в src/cli/Cli.ts',
      status: 'pending',
      maxAttempts: 3,
      inputs: ['status.change-plan'],
      outputs: ['status.cli.updated'],
      targetPath: 'src/cli/Cli.ts',
    },
    {
      id: 'step-6',
      type: 'finalize',
      action: 'summarize-result',
      subject: 'добавление команды /status',
      goal: 'Сообщить результат: добавление команды /status',
      status: 'pending',
      maxAttempts: 1,
      inputs: ['status.cli.updated'],
      outputs: ['task.final-result'],
    },
  ],
};

export const STATUS_SEARCH_FACTS = [
  {
    key: 'cli.command.example',
    value: 'src/cli/Cli.ts: COMMANDS array + inline runCli command branches',
    evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'Existing CLI commands are listed in COMMANDS and handled inline.' }],
  },
  {
    key: 'project.id.source',
    value: 'nodus.projectSession.projectId',
    evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'projectId', fact: 'ProjectSession exposes projectId.' }],
  },
  {
    key: 'conversation.id.source',
    value: 'conversation.id',
    evidence: [{ path: 'src/core/Conversation/Conversation.ts', symbol: 'id', fact: 'Conversation exposes readonly id.' }],
  },
  {
    key: 'index.files.count.source',
    value: 'nodus.projectSession.index?.files.length',
    evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'index', fact: 'Existing code uses this.index.files.length.' }],
  },
] as const;

export const STATUS_INTEGRATION_FACT = {
  key: 'cli.status.integration',
  value: 'Add /status to COMMANDS and add one inline runCli branch that prints projectSession.projectId, conversation.id, and projectSession.index?.files.length when index exists.',
} as const;

export const STATUS_CHANGE_FACT = {
  key: 'status.change-plan',
  value: 'Edit only src/cli/Cli.ts: add /status to COMMANDS and one inline handler using nodus.projectSession.projectId, conversation.id, and nodus.projectSession.index?.files.length.',
} as const;

export const STATUS_CLI_SOURCE = `// Cli.ts\nconst COMMANDS = [\n  { name: '/help', description: 'Show help.' },\n];\n\nexport async function runCli(): Promise<void> {\n  const value = '/help';\n  if (value === '/help') console.log('help');\n}\n`;
