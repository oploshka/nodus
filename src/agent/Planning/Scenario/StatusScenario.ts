// StatusScenario.ts
import type { RequirementMap } from '@agent/Planning/RequirementMap';

export const STATUS_SCENARIO_TASK = 'Добавь команду /status в CLI. Команда должна выводить текущий ID проекта, ID текущего conversation и количество файлов в индексе проекта, если индекс доступен. Используй существующие API и структуры проекта, не дублируй уже существующую логику получения этих данных. Не изменяй ничего, что не требуется для этой задачи.';

export const STATUS_SCENARIO_REQUIREMENTS: RequirementMap = {
  version: 1,
  goal: 'add /status CLI command to display project ID, conversation ID, and index file count',
  root: { kind: 'change-definition', key: 'status.command' },
  entries: [
    {
      ref: { kind: 'evidence', key: 'project.id.definition' },
      description: 'project ID source exposed by ProjectSession',
      requires: [],
      evidenceKind: 'definition',
      sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
    },
    {
      ref: { kind: 'evidence', key: 'conversation.id.definition' },
      description: 'conversation ID source exposed by Conversation',
      requires: [],
      evidenceKind: 'definition',
      sourceHints: ['src/core/Conversation/Conversation.ts'],
    },
    {
      ref: { kind: 'evidence', key: 'project.index.files' },
      description: 'project index files collection used for file count',
      requires: [],
      evidenceKind: 'definition',
      sourceHints: ['src/project/Index/ProjectIndex.ts'],
    },
    {
      ref: { kind: 'fact', key: 'project.id.access', scope: 'cli' },
      description: 'how the current project ID is accessed from the CLI runtime context',
      requires: [{ kind: 'evidence', key: 'project.id.definition' }],
    },
    {
      ref: { kind: 'fact', key: 'conversation.id.access', scope: 'cli' },
      description: 'how the current conversation ID is accessed from the CLI runtime context',
      requires: [{ kind: 'evidence', key: 'conversation.id.definition' }],
    },
    {
      ref: { kind: 'fact', key: 'project.index.fileCount.access', scope: 'cli' },
      description: 'how the CLI obtains the project index file count while handling an unavailable index',
      requires: [{ kind: 'evidence', key: 'project.index.files' }],
    },
    {
      ref: { kind: 'fact', key: 'cli.command.pattern', scope: 'cli' },
      description: 'how commands are registered, dispatched, and printed in the existing CLI',
      requires: [],
      sourceHints: ['src/cli/Cli.ts'],
    },
    {
      ref: { kind: 'change-definition', key: 'status.command' },
      description: 'minimal /status command implementation using the established CLI access facts and command pattern',
      requires: [
        { kind: 'fact', key: 'project.id.access', scope: 'cli' },
        { kind: 'fact', key: 'conversation.id.access', scope: 'cli' },
        { kind: 'fact', key: 'project.index.fileCount.access', scope: 'cli' },
        { kind: 'fact', key: 'cli.command.pattern', scope: 'cli' },
      ],
      targetPath: 'src/cli/Cli.ts',
    },
  ],
};
